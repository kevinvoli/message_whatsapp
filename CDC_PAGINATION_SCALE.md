# Cahier des charges — Pagination infinie à l'échelle des millions
## Projet WhatsApp Commercial Platform — Architecture haute performance

---

| Champ | Valeur |
|-------|--------|
| **Version** | 1.0 |
| **Date** | 2026-04-06 |
| **Référence CDC de base** | `CDC_PAGINATION_INFINIE.md` |
| **Référence plan** | `PLAN_PAGINATION_INFINIE.md` |
| **Cible de charge** | 1 000 000+ conversations/jour, 50 000+ messages/heure en pointe |
| **Stack backend** | NestJS 11, TypeORM 0.3, Socket.io 4.8, MySQL 8, Redis 7 |
| **Stack frontend** | Next.js 16, React 19, Zustand 5, Socket.io-client 4.8 |

---

## Préambule

Ce document **étend** `CDC_PAGINATION_INFINIE.md` avec toutes les contraintes
d'architecture, d'optimisation et de flux de données nécessaires pour supporter
**des millions de conversations par jour**. Il annule et remplace les sections 4 et 5
de ce document et ajoute les sections 9 à 14 absentes de la version de base.

Toutes les exigences fonctionnelles (EF-01 à EF-07) restent valides. Seules les
exigences techniques (ET-01 à ET-08) sont enrichies ou remplacées.

---

## Volumétrie cible

| Indicateur | Valeur estimée | Base du calcul |
|------------|----------------|----------------|
| Conversations actives / jour | 1 000 000 | cible opérationnelle |
| Messages entrants / heure (pic) | 50 000 | 14 msg/conv en moyenne |
| Messages entrants / seconde (pic) | ~800 | pointe 5× la moyenne |
| Connexions WebSocket simultanées | 500–2 000 | agents commerciaux actifs |
| Requêtes DB / seconde (pic) | 5 000–8 000 | lectures + écritures |
| Taille table `whatsapp_message` / mois | ~420 M lignes | 800 msg/s × 600 s/min × 43 200 min |
| Taille table `whatsapp_chat` / mois | ~30 M lignes | 1 M conv/j × 30 j |
| Payload réseau total / connect (objectif) | < 200 KB | 300 conv. sans messages |

---

## 1. Goulots d'étranglement identifiés

Les 10 défauts critiques suivants ont été identifiés par analyse statique du code.
Chacun est traité dans une section dédiée.

| ID | Composant | Symptôme | Impact à 1 M conv/j |
|----|-----------|----------|---------------------|
| **G1** | `connectedAgents` Map | Unbounded — jamais purgé | OOM en 24 h |
| **G2** | `findRecentByChatIds()` | Aucune limite SQL | Charge 50 M lignes au connect |
| **G3** | `poolSize: 100` + `retryAttempts: 0` | Insuffisant à 5 000 req/s | Connexions refusées en pic |
| **G4** | Index manquant `(chat_id, from_me, status)` | Full scan messages | 10× overhead sur unread |
| **G5** | Mutex global `QueueService` | 1 seul lock applicatif | Latence 30 s+ en pic |
| **G6** | Pas d'adaptateur Redis Socket.io | Un seul process | Lose events en multi-instance |
| **G7** | `EventEmitter.defaultMaxListeners = 0` | Masque les memory leaks | Bugs silencieux en prod |
| **G8** | `IDX_chat_poste_activity` migration no-op | Index jamais créé | Keyset 10× plus lent |
| **G9** | `unread_count` colonne statique | Drift en production | Compteurs faux en scale |
| **G10** | Pas de stratégie d'archivage | Table non partitionnée | Requêtes dégradées après 3 M lignes |

---

## 2. Architecture cible

### 2.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
│   Whapi webhooks    Meta webhooks    Agents commerciaux (browser)   │
└────────┬────────────────────┬────────────────────┬───────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼ WebSocket TLS
┌────────────────────────────────────────────────────────────┐
│                   NGINX / Load Balancer                    │
│  Sticky sessions WebSocket (ip_hash ou cookie)             │
│  Rate limiting webhook : 10 000 req/s                      │
└──────┬────────────────────────────────────────────────────-┘
       │ HTTP / WebSocket
       ▼
┌──────────────────────────────────────────────┐
│   NestJS Cluster  (N instances Docker)        │
│   ├── Instance 1  (port 3001)                 │
│   ├── Instance 2  (port 3001)                 │
│   └── Instance N  (port 3001)                 │
│                                               │
│   Socket.io-Redis adapter ←────────────────┐ │
└──────────────────┬───────────────────────--┘ │
                   │ TypeORM                    │
       ┌───────────┼──────────────┐             │
       ▼           ▼              ▼             │
 ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
 │ MySQL    │ │ MySQL    │ │ Redis 7      │────-┘
 │ PRIMARY  │ │ REPLICA  │ │ Socket.io    │
 │ écritures│ │ lectures │ │ Stats cache  │
 │          │ │          │ │ Pub/Sub msgs │
 └──────────┘ └──────────┘ └──────────────┘
```

### 2.2 Règles de routage

| Opération | Base ciblée |
|-----------|-------------|
| INSERT / UPDATE / DELETE | MySQL PRIMARY |
| SELECT paginated conversations | MySQL REPLICA |
| SELECT stats (COUNT) | Redis cache → fallback REPLICA |
| SELECT messages (clic) | MySQL REPLICA |
| Émission Socket.io cross-instance | Redis Pub/Sub via adaptateur |

### 2.3 Scalabilité horizontale

Le backend doit supporter **N instances sans état partagé en mémoire**.
Toute donnée partagée (état agents, stats, sessions) passe par Redis.

---

## 3. Exigences techniques — Infrastructure

### ET-INF-01 — Adaptateur Redis pour Socket.io

**Priorité :** Critique — bloquant pour multi-instance

**Problème actuel :**  
Socket.io sans Redis adapter ne peut émettre des events qu'aux connexions
du même process. Avec 2+ instances, un event `MESSAGE_ADD` généré sur l'instance 1
n'atteint pas les agents connectés à l'instance 2.

**Solution :**

```bash
npm install @socket.io/redis-adapter ioredis
```

```typescript
// main.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'ioredis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

**Critères d'acceptance :**
- [ ] Un message envoyé à l'instance 1 est reçu par tous les agents connectés
  à toutes les instances
- [ ] `io.to(room).emit()` fonctionne en cross-instance
- [ ] La déconnexion d'un agent sur l'instance 1 est propagée
- [ ] Test de validation : 2 instances + 1 agent par instance + 1 message → 2 réceptions

---

### ET-INF-02 — Pool de connexions MySQL

**Problème actuel :**  
`poolSize: 100, retryAttempts: 0` — à 5 000 req/s, 100 connexions partagées entre
N instances signifie 100/N par instance. Avec 5 instances et 1 000 req/s par instance,
chaque connexion doit traiter 10 req/s avec des latences SQL de 5–20 ms → saturation.

**Configuration cible :**

```typescript
// database.module.ts
TypeOrmModule.forRoot({
  type: 'mysql',
  
  // Écriture → PRIMARY
  host: process.env.DB_PRIMARY_HOST,
  port: 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  
  extra: {
    connectionLimit: 30,          // 30 par instance (150 total sur 5 instances)
    waitForConnections: true,
    queueLimit: 200,              // file d'attente max avant rejet
    acquireTimeout: 10000,        // 10 s max pour obtenir une connexion
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  },
  
  retryAttempts: 3,              // réessayer 3 fois (pas 0)
  retryDelay: 1000,
  
  // Pool lecture REPLICA (TypeORM ne supporte pas nativement le read replica,
  // utiliser un DataSource secondaire pour les queries en lecture)
  replication: {
    master: {
      host: process.env.DB_PRIMARY_HOST,
      port: 3306,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    },
    slaves: [
      {
        host: process.env.DB_REPLICA_HOST,
        port: 3306,
        username: process.env.DB_READ_USER,
        password: process.env.DB_READ_PASS,
        database: process.env.DB_NAME,
      },
    ],
  },
})
```

**Critères d'acceptance :**
- [ ] Aucune connexion refusée en dessous de 8 000 req/s DB
- [ ] `queueLimit` loggué en monitoring si atteint
- [ ] Les SELECT utilisent le replica (vérifier via `SHOW PROCESSLIST` sur chaque host)
- [ ] `retryAttempts: 3` — les connexions perdues se rétablissent automatiquement

---

### ET-INF-03 — EventEmitter — Remplacement du `defaultMaxListeners = 0`

**Problème actuel :**  
`EventEmitter.defaultMaxListeners = 0` dans `main.ts` désactive complètement
l'avertissement de fuite mémoire Node.js. Cette ligne masque des bugs critiques.

**Solution :**

```typescript
// main.ts — SUPPRIMER cette ligne :
// EventEmitter.defaultMaxListeners = 0;   ← RETIRER

// REMPLACER par une valeur raisonnée :
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 50;  // suffisant pour NestJS + Socket.io
```

**Critères d'acceptance :**
- [ ] L'avertissement Node.js « MaxListenersExceededWarning » est visible si le seuil est dépassé
- [ ] Aucun warning au démarrage normal de l'application

---

### ET-INF-04 — Docker Compose production

```yaml
# docker-compose.prod.yml
version: '3.9'

services:
  backend:
    image: whatsapp-backend:${TAG}
    deploy:
      replicas: 3                        # 3 instances minimum
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
    environment:
      - REDIS_URL=redis://redis:6379
      - DB_PRIMARY_HOST=mysql-primary
      - DB_REPLICA_HOST=mysql-replica
      - NODE_OPTIONS=--max-old-space-size=768
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend

volumes:
  redis_data:
```

**nginx.conf — sticky sessions WebSocket :**

```nginx
upstream backend {
    ip_hash;                          # sticky session par IP
    server backend_1:3001;
    server backend_2:3001;
    server backend_3:3001;
    keepalive 64;
}

server {
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;    # pas de timeout sur WebSocket
        proxy_send_timeout 86400s;
    }
    
    location /webhooks/ {
        proxy_pass http://backend;
        proxy_read_timeout 30s;
        limit_req zone=webhooks burst=500 nodelay;
    }
}
```

---

## 4. Exigences techniques — Base de données

### ET-DB-01 — Index obligatoires

Les index suivants sont **obligatoires** avant tout déploiement en production.

```sql
-- ─────────────────────────────────────────────
-- TABLE whatsapp_chat
-- ─────────────────────────────────────────────

-- Keyset pagination (CRITIQUE — manquant, migration marquée no-op)
-- Doit être créé MANUELLEMENT si la migration est no-op
CREATE INDEX IDX_chat_poste_activity
  ON whatsapp_chat (poste_id, last_activity_at DESC, chat_id DESC);

-- Stats filtrées par poste (soft-delete safe)
CREATE INDEX IDX_chat_poste_status_deleted
  ON whatsapp_chat (poste_id, status, deletedAt);

-- Soft-delete + tri temporel (analytique admin)
CREATE INDEX IDX_chat_poste_time
  ON whatsapp_chat (poste_id, createdAt, deletedAt);

-- ─────────────────────────────────────────────
-- TABLE whatsapp_message
-- ─────────────────────────────────────────────

-- Comptage unread (CRITIQUE — manquant)
CREATE INDEX IDX_msg_chat_status
  ON whatsapp_message (chat_id, from_me, status, deletedAt);

-- Pagination messages dans une conversation (déjà présent — vérifier)
-- Si absent : CREATE INDEX IDX_msg_chat_ts ON whatsapp_message (chat_id, timestamp DESC);
```

**Critères d'acceptance :**
- [ ] `EXPLAIN SELECT` sur `findByPosteId()` montre `Using index` pour `IDX_chat_poste_activity`
- [ ] `EXPLAIN SELECT` sur `countUnreadBulk()` montre `Using index` pour `IDX_msg_chat_status`
- [ ] Temps de création d'index mesuré (prévoir une fenêtre de maintenance si > 5 M lignes)

---

### ET-DB-02 — Partitionnement de `whatsapp_message`

La table `whatsapp_message` atteint ~420 M lignes par mois.
Au-delà de 50 M lignes, les requêtes sur `chat_id` sans partition
parcourent toute la table même avec un index.

**Stratégie : RANGE PARTITION par mois sur `timestamp`**

```sql
ALTER TABLE whatsapp_message
PARTITION BY RANGE (UNIX_TIMESTAMP(timestamp)) (
  PARTITION p_2026_01 VALUES LESS THAN (UNIX_TIMESTAMP('2026-02-01')),
  PARTITION p_2026_02 VALUES LESS THAN (UNIX_TIMESTAMP('2026-03-01')),
  PARTITION p_2026_03 VALUES LESS THAN (UNIX_TIMESTAMP('2026-04-01')),
  PARTITION p_2026_04 VALUES LESS THAN (UNIX_TIMESTAMP('2026-05-01')),
  PARTITION p_future   VALUES LESS THAN MAXVALUE
);
```

**Gestion automatique des partitions :**

```typescript
// partition-maintenance.service.ts
@Cron('0 0 25 * *')  // le 25 de chaque mois
async createNextMonthPartition() {
  const next = dayjs().add(1, 'month');
  const partName = `p_${next.format('YYYY_MM')}`;
  const cutoff = next.add(1, 'month').startOf('month').unix();
  await this.dataSource.query(
    `ALTER TABLE whatsapp_message REORGANIZE PARTITION p_future INTO (
       PARTITION ${partName} VALUES LESS THAN (${cutoff}),
       PARTITION p_future    VALUES LESS THAN MAXVALUE
     )`
  );
}
```

**Archivage :**

```typescript
// archive.service.ts
@Cron('0 3 1 * *')  // le 1er de chaque mois à 3h
async archiveOldMessages() {
  const cutoffMonth = dayjs().subtract(6, 'month').format('YYYY_MM');
  // Copier la partition vers une table d'archive
  await this.dataSource.query(
    `INSERT INTO whatsapp_message_archive
     SELECT * FROM whatsapp_message PARTITION (p_${cutoffMonth})`
  );
  // Supprimer la partition archivée
  await this.dataSource.query(
    `ALTER TABLE whatsapp_message DROP PARTITION p_${cutoffMonth}`
  );
  this.logger.log(`Partition p_${cutoffMonth} archivée et supprimée`);
}
```

**Critères d'acceptance :**
- [ ] `EXPLAIN PARTITIONS SELECT` montre `partition_pruning` actif sur les requêtes messages
- [ ] Le cron de création s'exécute sans erreur chaque mois
- [ ] Le cron d'archivage s'exécute sans impacter les requêtes en cours (pas de lock table)

---

### ET-DB-03 — Partitionnement de `whatsapp_chat`

```sql
-- Partitionnement par hash sur poste_id pour distribuer les postes
-- (30 M lignes/mois : moins urgent que whatsapp_message)
ALTER TABLE whatsapp_chat
PARTITION BY HASH (CRC32(poste_id))
PARTITIONS 16;
```

> À appliquer uniquement si la table dépasse 5 M lignes.
> En dessous, l'index `IDX_chat_poste_activity` est suffisant.

---

### ET-DB-04 — Colonne `unread_count` — Suppression de la dérive

**Problème :** La colonne `unread_count` est mise à jour via des requêtes UPDATE
distinctes et peut dériver (messages supprimés, marqués lus manuellement, concurrence).

**Solution : `unread_count` devient calculé à la volée depuis `whatsapp_message`**

La requête de stats utilise déjà l'EXISTS subquery. L'objectif est de **ne jamais
lire `chat.unread_count` dans les chemins critiques** et de ne le mettre à jour
qu'en best-effort pour les requêtes non critiques.

```typescript
// whatsapp_chat.service.ts
// Méthode getStatsForPoste() — utilise uniquement des COUNT sur whatsapp_message
async getStatsForPoste(poste_id: string): Promise<PosteStats> {
  const cached = await this.redis.get(`stats:poste:${poste_id}`);
  if (cached) return JSON.parse(cached);

  const result = await this.chatRepository
    .createQueryBuilder('chat')
    .select('COUNT(*)', 'totalAll')
    .addSelect(
      `SUM(CASE WHEN EXISTS (
         SELECT 1 FROM whatsapp_message m
         WHERE m.chat_id = chat.chat_id
           AND m.from_me = 0
           AND m.status IN ('sent','delivered')
           AND m.deletedAt IS NULL
       ) THEN 1 ELSE 0 END)`,
      'totalUnreadConversations',
    )
    .where('chat.poste_id = :poste_id', { poste_id })
    .andWhere('chat.deletedAt IS NULL')
    .getRawOne();

  const stats = {
    totalAll: Number(result.totalAll),
    totalUnreadConversations: Number(result.totalUnreadConversations),
  };

  // Cache 30 secondes — invalider sur MESSAGE_ADD ou CONVERSATION_UPSERT
  await this.redis.setex(`stats:poste:${poste_id}`, 30, JSON.stringify(stats));
  return stats;
}
```

---

## 5. Exigences techniques — Cache Redis

### ET-CACHE-01 — Stratégie de cache des stats

Les stats de poste (totalAll, totalUnreadConversations) sont recalculées
à chaque connexion. Avec 500 agents qui se connectent simultanément, cela
représente 500 COUNT(*) consécutifs sur la même table.

**Pattern : Cache-aside avec TTL court + invalidation par event**

```typescript
// redis-stats.service.ts
@Injectable()
export class RedisStatsService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private key(poste_id: string) { return `stats:poste:${poste_id}`; }

  async getStats(poste_id: string): Promise<PosteStats | null> {
    const raw = await this.redis.get(this.key(poste_id));
    return raw ? JSON.parse(raw) : null;
  }

  async setStats(poste_id: string, stats: PosteStats): Promise<void> {
    await this.redis.setex(this.key(poste_id), 30, JSON.stringify(stats));
  }

  async invalidate(poste_id: string): Promise<void> {
    await this.redis.del(this.key(poste_id));
  }
}
```

**Invalidation :**

```typescript
// whatsapp_message.gateway.ts — sur réception MESSAGE_ADD
await this.redisStats.invalidate(chat.poste_id);
// L'event TOTAL_UNREAD_UPDATE est émis APRÈS invalidation
// Le prochain appel getStatsForPoste() recalcule depuis la DB
```

**TTL et invalidation :**

| Event | Action cache |
|-------|-------------|
| `MESSAGE_ADD` (entrant) | `invalidate(poste_id)` |
| `CONVERSATION_UPSERT` | `invalidate(poste_id)` |
| `CONVERSATION_REMOVED` | `invalidate(poste_id)` |
| Aucun event pendant 30 s | TTL expire automatiquement |
| Agent se connecte (cache hit) | Retourne cached, aucune DB |
| Agent se connecte (cache miss) | 1 seule requête DB, mise en cache |

---

### ET-CACHE-02 — `connectedAgents` Map → Redis Hash

**Problème (G1) :**  
`connectedAgents` est une `Map<socket_id, agent_info>` en mémoire du process.
Elle n'est jamais purgée en cas de déconnexion anormale et n'est pas partagée
entre instances.

**Solution :**

```typescript
// connected-agents.service.ts
@Injectable()
export class ConnectedAgentsService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async register(socketId: string, info: AgentInfo): Promise<void> {
    await this.redis.setex(
      `agent:socket:${socketId}`,
      300,  // TTL 5 min — renouvelé par heartbeat
      JSON.stringify(info),
    );
    await this.redis.sadd(`poste:agents:${info.poste_id}`, socketId);
    await this.redis.expire(`poste:agents:${info.poste_id}`, 300);
  }

  async unregister(socketId: string, poste_id: string): Promise<void> {
    await this.redis.del(`agent:socket:${socketId}`);
    await this.redis.srem(`poste:agents:${poste_id}`, socketId);
  }

  async getAgentsByPoste(poste_id: string): Promise<AgentInfo[]> {
    const socketIds = await this.redis.smembers(`poste:agents:${poste_id}`);
    if (!socketIds.length) return [];
    const raw = await this.redis.mget(
      socketIds.map(id => `agent:socket:${id}`)
    );
    return raw.filter(Boolean).map(r => JSON.parse(r!));
  }

  async heartbeat(socketId: string, poste_id: string): Promise<void> {
    await this.redis.expire(`agent:socket:${socketId}`, 300);
    await this.redis.expire(`poste:agents:${poste_id}`, 300);
  }
}
```

**Heartbeat côté gateway :**

```typescript
// Côté client : émettre 'heartbeat' toutes les 2 minutes
// Côté serveur :
@SubscribeMessage('heartbeat')
async handleHeartbeat(@ConnectedSocket() socket: Socket) {
  const agent = await this.connectedAgents.getAgent(socket.id);
  if (agent) await this.connectedAgents.heartbeat(socket.id, agent.poste_id);
}
```

**Critères d'acceptance :**
- [ ] `getAgentsByPoste()` retourne les agents de toutes les instances
- [ ] Un agent déconnecté depuis > 5 min n'apparaît plus dans la liste
- [ ] TTL renouvelé correctement par le heartbeat
- [ ] La Map `connectedAgents` en mémoire est supprimée du gateway

---

## 6. Exigences techniques — Gateway WebSocket

### ET-GW-01 — Suppression de `findRecentByChatIds()` du flow connect

**Problème (G2) :**  
`sendConversationsToClientInternal()` appelle `findRecentByChatIds()` qui charge
**tous** les messages de toutes les conversations du poste sans LIMIT.

**Nouveau flow connect :**

```typescript
// whatsapp_message.gateway.ts
private async sendConversationsToClientInternal(
  socket: Socket,
  poste_id: string,
): Promise<void> {
  // 1. Stats (cache Redis ou DB)
  const stats = await this.chatService.getStatsForPoste(poste_id);

  // 2. 300 conversations paginées — AUCUN message pré-chargé
  const { chats, hasMore } = await this.chatService.findByPosteId(
    poste_id,
    [],       // excludeStatuses
    300,      // limit
    // pas de curseur → premier chargement
  );

  // 3. Dernier message de chaque conversation (1 seul message par conv)
  //    via une requête bulk avec LIMIT 1 par chat_id
  const lastMessages = await this.messageService.findLastMessagesBulk(
    chats.map(c => c.chat_id),
  );

  // 4. Mapper sans messages[]
  const conversations = chats.map(chat =>
    this.mapConversation(chat, lastMessages.get(chat.chat_id) ?? null)
  );

  // 5. Cursor
  const last = chats.at(-1);
  const nextCursor = last
    ? { activityAt: last.last_activity_at.toISOString(), chatId: last.chat_id }
    : null;

  // 6. Émettre
  socket.emit('chat:event', {
    type: 'CONVERSATION_LIST',
    payload: { conversations, hasMore, nextCursor },
  });
  socket.emit('chat:event', {
    type: 'TOTAL_UNREAD_UPDATE',
    payload: stats,
  });
}
```

**Méthode `findLastMessagesBulk()` à ajouter :**

```typescript
// whatsapp_message.service.ts
async findLastMessagesBulk(
  chatIds: string[],
): Promise<Map<string, WhatsappMessage>> {
  if (!chatIds.length) return new Map();

  // Requête optimisée : 1 message par chat_id
  const rows = await this.messageRepository
    .createQueryBuilder('m')
    .select('m.*')
    .where('m.chat_id IN (:...chatIds)', { chatIds })
    .andWhere('m.deletedAt IS NULL')
    .andWhere(`m.id = (
      SELECT id FROM whatsapp_message m2
      WHERE m2.chat_id = m.chat_id
        AND m2.deletedAt IS NULL
      ORDER BY m2.timestamp DESC
      LIMIT 1
    )`)
    .getRawMany();

  return new Map(rows.map(r => [r.chat_id, r]));
}
```

> **Alternative plus performante** (si N > 1 000 chats) : utiliser une
> requête avec ROW_NUMBER() ou un LEFT JOIN auto-exclusif :

```sql
SELECT m.*
FROM whatsapp_message m
LEFT JOIN whatsapp_message m2
  ON m.chat_id = m2.chat_id
  AND m2.timestamp > m.timestamp
  AND m2.deletedAt IS NULL
WHERE m.chat_id IN (...)
  AND m.deletedAt IS NULL
  AND m2.id IS NULL;
```

---

### ET-GW-02 — Throttle `conversations:get`

Le handler `conversations:get` est le seul endpoint de scroll infini.
Il faut le protéger contre le spam (scroll automatique, bug client) :

```typescript
// throttle existant : { maxRequests: 10, windowMs: 10_000 }
// Ce seuil est insuffisant pour un chargement initial de 300 conversations
// qui peut nécessiter 1 appel immédiat. Adapter :

@UseGuards(WsThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 10000 } })  // 20 req/10s par socket
@SubscribeMessage('conversations:get')
async handleGetConversations(
  @ConnectedSocket() socket: Socket,
  @MessageBody() dto: GetConversationsDto,
) { ... }
```

---

### ET-GW-03 — Mutex global → Mutex par poste

**Problème (G5) :**  
`QueueService` utilise un mutex global `Mutex` (1 seul lock pour tout le système).
Un message entrant bloque tous les autres pendant le traitement du dispatch.

**Solution :**

```typescript
// queue.service.ts
private readonly mutexByPoste = new Map<string, Mutex>();

private getOrCreateMutex(poste_id: string): Mutex {
  if (!this.mutexByPoste.has(poste_id)) {
    this.mutexByPoste.set(poste_id, new Mutex());
  }
  return this.mutexByPoste.get(poste_id)!;
}

async processMessage(message: InboundMessage): Promise<void> {
  const mutex = this.getOrCreateMutex(message.poste_id);
  const release = await mutex.acquire();
  try {
    await this.dispatch(message);
  } finally {
    release();
  }
}

// Nettoyage périodique des mutex inutilisés (éviter fuite mémoire)
@Cron('0 */10 * * * *')  // toutes les 10 minutes
cleanUnusedMutexes() {
  // Supprimer les mutex des postes sans agent connecté
  for (const [poste_id] of this.mutexByPoste) {
    if (!this.connectedAgents.hasAgentsForPoste(poste_id)) {
      this.mutexByPoste.delete(poste_id);
    }
  }
}
```

**Critères d'acceptance :**
- [ ] 100 messages simultanés sur 10 postes différents → 10 traitements en parallèle
- [ ] 100 messages simultanés sur le même poste → traitement séquentiel
- [ ] La Map `mutexByPoste` ne croît pas indéfiniment (cron de nettoyage actif)

---

## 7. Exigences techniques — Pagination et flux de données

### ET-PAG-01 — Keyset pagination (enrichissement)

**Reprise de ET-01 de `CDC_PAGINATION_INFINIE.md` avec contraintes scale.**

La clause SQL du keyset doit exploiter **uniquement** l'index `IDX_chat_poste_activity` :

```sql
-- Requête optimale — vérifier avec EXPLAIN
SELECT *
FROM whatsapp_chat
WHERE poste_id = ?
  AND deletedAt IS NULL
  AND (
    last_activity_at < ?
    OR (last_activity_at = ? AND chat_id < ?)
  )
ORDER BY last_activity_at DESC, chat_id DESC
LIMIT ?
```

**Ne pas utiliser OFFSET.** À 1 M de conversations, `OFFSET 500000` force MySQL
à lire 500 000 lignes pour les ignorer, même avec un index.

**Migration obligatoire :**

```typescript
// 20260406_create_chat_poste_activity_index.ts
export class CreateChatPosteActivityIndex20260406 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Vérifier si l'index existe avant de créer
    const [rows] = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'whatsapp_chat'
         AND index_name = 'IDX_chat_poste_activity'`
    );
    if (Number(rows.cnt) > 0) {
      console.log('IDX_chat_poste_activity déjà présent — skip');
      return;
    }
    await queryRunner.query(
      `CREATE INDEX IDX_chat_poste_activity
       ON whatsapp_chat (poste_id, last_activity_at DESC, chat_id DESC)`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IDX_chat_poste_activity ON whatsapp_chat`
    );
  }
}
```

---

### ET-PAG-02 — Flux de données au connect — Contraintes de temps

| Étape | Opération | Timeout max | Outil |
|-------|-----------|-------------|-------|
| 1 | `getStatsForPoste()` — cache Redis | 5 ms (hit) / 50 ms (miss) | Redis + REPLICA |
| 2 | `findByPosteId(300)` — keyset | 100 ms | REPLICA + IDX_chat_poste_activity |
| 3 | `findLastMessagesBulk(300 chat_ids)` | 150 ms | REPLICA + IDX_msg_chat_ts |
| 4 | Mapping + sérialisation JSON | 30 ms | CPU |
| 5 | Émission WebSocket | 20 ms | réseau LAN |
| **Total** | | **< 400 ms** | |

Si l'étape 3 dépasse 150 ms : livrer `CONVERSATION_LIST` sans `lastMessage`
puis émettre un `LAST_MESSAGES_PATCH` asynchrone.

---

### ET-PAG-03 — Flux d'ingestion des webhooks à l'échelle

Un webhook entrant à 800 msg/s génère :
- 800 INSERTs/s dans `whatsapp_message`
- 800 UPDATEs/s sur `whatsapp_chat.last_activity_at`
- 800 invalidations de cache Redis
- 800 émissions Socket.io (via adaptateur Redis → broadcast)

**Goulots et mitigations :**

| Goulot | Mitigation |
|--------|-----------|
| 800 INSERTs/s unitaires | Batch INSERT : grouper par lot de 50 messages / 100 ms |
| 800 UPDATEs `last_activity_at` unitaires | Dédupliquer par `chat_id` dans la fenêtre de batch |
| 800 émissions Socket.io séparées | Grouper en 1 émission `MESSAGES_BATCH` par poste / 100 ms |
| 800 invalidations Redis | 1 pipeline Redis (`MULTI/EXEC`) pour toutes les invalidations |

**Batch writer :**

```typescript
// batch-message-writer.service.ts
@Injectable()
export class BatchMessageWriterService implements OnModuleInit {
  private buffer: InboundMessage[] = [];
  private timer: NodeJS.Timeout | null = null;

  private flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0, this.buffer.length);
    this.processBatch(batch).catch(err =>
      this.logger.error('Batch flush error', err)
    );
  }

  onModuleInit() {
    // Flush toutes les 100 ms
    setInterval(() => this.flush(), 100);
  }

  enqueue(message: InboundMessage) {
    this.buffer.push(message);
    if (this.buffer.length >= 50) this.flush(); // flush anticipé si buffer plein
  }

  private async processBatch(messages: InboundMessage[]): Promise<void> {
    // 1. INSERT bulk
    await this.messageRepository.insert(messages);
    
    // 2. UPDATE last_activity_at — dédupliqué par chat_id (dernier timestamp)
    const latestByChatId = new Map<string, Date>();
    for (const m of messages) {
      const prev = latestByChatId.get(m.chat_id);
      if (!prev || m.timestamp > prev) latestByChatId.set(m.chat_id, m.timestamp);
    }
    await Promise.all(
      [...latestByChatId.entries()].map(([chat_id, ts]) =>
        this.chatRepository.update({ chat_id }, { last_activity_at: ts })
      )
    );
    
    // 3. Invalider stats Redis par poste
    const posteIds = [...new Set(messages.map(m => m.poste_id))];
    await this.redis.del(...posteIds.map(id => `stats:poste:${id}`));
    
    // 4. Émettre via Socket.io (groupé par poste)
    const byPoste = messages.reduce((acc, m) => {
      (acc[m.poste_id] ??= []).push(m);
      return acc;
    }, {} as Record<string, InboundMessage[]>);
    for (const [poste_id, msgs] of Object.entries(byPoste)) {
      this.io.to(`poste:${poste_id}`).emit('chat:event', {
        type: 'MESSAGES_BATCH',
        payload: msgs.map(m => this.mapMessage(m)),
      });
    }
  }
}
```

---

## 8. Exigences techniques — Surveillance et observabilité

### ET-OBS-01 — Métriques obligatoires

Les métriques suivantes doivent être exposées via `/metrics` (Prometheus) :

```typescript
// metrics.module.ts
import { Counter, Histogram, Gauge } from 'prom-client';

// Conversations chargées au connect
conversationsLoadedTotal: Counter  // +300 par connect
conversationsLoadDuration: Histogram  // en ms

// Messages ingérés
messagesIngestedTotal: Counter     // +1 par message entrant
messagesBatchSize: Histogram       // taille des batches flush

// WebSocket
wsConnectedAgents: Gauge           // jauge agents connectés
wsEventEmittedTotal: Counter       // par type d'event

// Cache Redis
redisCacheHit: Counter             // stats cache hit
redisCacheMiss: Counter            // stats cache miss

// Pool DB
dbPoolAcquireWait: Histogram       // temps d'attente pool (ms)
dbPoolQueueDepth: Gauge            // longueur file d'attente pool
```

### ET-OBS-02 — Alertes critiques

| Alerte | Seuil | Priorité |
|--------|-------|----------|
| `conversationsLoadDuration > 1000 ms` | P1 | Index manquant ou REPLICA surchargé |
| `dbPoolQueueDepth > 50` | P0 | Pool insuffisant, ajouter des instances |
| `wsConnectedAgents` chute soudaine | P1 | Redis adapter down ou déploiement raté |
| `redisCacheMiss > 80%` | P2 | TTL trop court ou invalidation trop agressive |
| `messagesBatchSize > 100` | P2 | Buffer surchargé, augmenter la fréquence de flush |

---

## 9. Migration et ordre de déploiement

Les étapes suivantes **doivent être exécutées dans cet ordre exact**.
Certaines peuvent être appliquées sans downtime (online DDL MySQL 8),
d'autres nécessitent une fenêtre de maintenance.

```
┌──────────────────────────────────────────────────────────────────┐
│  PHASE 0 — Infrastructure (sans code)                            │
│  ├─ 0a : Provisionner Redis 7 (docker-compose ou RDS ElastiCache)│
│  ├─ 0b : Provisionner MySQL REPLICA (slave du PRIMARY existant)  │
│  └─ 0c : Configurer NGINX sticky sessions                        │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 1 — Index MySQL (online DDL — sans downtime)              │
│  ├─ 1a : CREATE INDEX IDX_chat_poste_activity (online)           │
│  ├─ 1b : CREATE INDEX IDX_chat_poste_status_deleted (online)     │
│  └─ 1c : CREATE INDEX IDX_msg_chat_status (online)               │
│  ⚠ Mesurer la durée sur les données réelles (peut prendre 30 min)│
├──────────────────────────────────────────────────────────────────┤
│  PHASE 2 — Backend (déployé en rolling update)                   │
│  ├─ 2a : Supprimer EventEmitter.defaultMaxListeners = 0          │
│  ├─ 2b : Ajouter Socket.io Redis adapter                         │
│  ├─ 2c : Ajouter RedisStatsService + ConnectedAgentsService      │
│  ├─ 2d : Modifier database.module.ts (pool + replica)            │
│  ├─ 2e : Modifier findByPosteId() → keyset pagination            │
│  ├─ 2f : Supprimer findRecentByChatIds() du flow connect         │
│  └─ 2g : Ajouter findLastMessagesBulk()                          │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 3 — Gateway WebSocket                                     │
│  ├─ 3a : sendConversationsToClientInternal() → nouveau flow      │
│  ├─ 3b : handleGetConversations() → cursor + limit               │
│  ├─ 3c : Remplacer connectedAgents Map → ConnectedAgentsService  │
│  └─ 3d : Mutex global → mutex par poste                          │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 4 — Frontend (déployé indépendamment du backend)          │
│  ├─ 4a : Store Zustand — nouveaux états pagination               │
│  ├─ 4b : CONVERSATION_LIST → setConversations / appendConversations│
│  ├─ 4c : IntersectionObserver → loadMoreConversations()          │
│  ├─ 4d : selectConversation() → toujours messages:get            │
│  └─ 4e : ContactSidebarPanel → sentinel partagé                  │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 5 — Partitionnement (avec fenêtre maintenance 30 min)     │
│  ├─ 5a : Exporter + réimporter whatsapp_message avec PARTITION   │
│  ├─ 5b : Créer cron partition-maintenance.service.ts             │
│  └─ 5c : Créer cron archive.service.ts                           │
├──────────────────────────────────────────────────────────────────┤
│  PHASE 6 — Observabilité                                         │
│  ├─ 6a : Exposer métriques Prometheus /metrics                   │
│  ├─ 6b : Configurer alertes (Grafana ou PagerDuty)               │
│  └─ 6c : Dashboard Grafana : agents connectés, latence, pool     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 10. Critères de validation — Charge

### 10.1 Test de montée en charge

| Scénario | Outil | Résultat attendu |
|----------|-------|-----------------|
| 500 connexions WebSocket simultanées | k6 / Artillery | 100% connectés en < 5 s |
| 1 000 `conversations:get` / seconde | k6 | P95 < 300 ms |
| 800 webhooks / seconde (pic) | k6 | 0 message perdu, P99 < 500 ms |
| 1 agent déconnecté → reconnexion | Manuel | Conversations rechargées en < 1 s |
| 2 instances Redis adapter | Manuel | Events cross-instance reçus |

### 10.2 Test de régression (invariants)

Tous les critères de `CDC_PAGINATION_INFINIE.md` section 8 restent valides
et sont rejoués après chaque phase de déploiement.

### 10.3 Seuils de SLA en production

| Métrique | SLA |
|----------|-----|
| Chargement initial conversations (P99) | < 800 ms |
| Chargement "load more" 50 conversations (P99) | < 400 ms |
| Chargement messages au clic (P99) | < 300 ms |
| Disponibilité WebSocket | > 99.9% |
| Perte de message 0-drop | 100% (aucune perte) |

---

## 11. Risques et mitigation

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|-----------|
| Redis down → perte état agents | Faible | Élevé | Redis Sentinel ou Cluster HA + dégradation gracieuse (Map locale fallback) |
| MySQL REPLICA décalée (lag) | Moyen | Moyen | Lire les stats depuis PRIMARY si lag > 1 s (Health check réplication) |
| Partition DDL lock table | Moyen | Élevé | Faire en dehors des heures de pointe, avec pt-online-schema-change |
| Batch writer perte en cas de crash | Moyen | Moyen | Buffer en Redis List plutôt qu'en mémoire (persistance) |
| Sticky session cassée par déploiement | Élevé | Faible | Rolling update 1 instance à la fois, reconnexion automatique frontend |
| Index creation > 1 h sur table existante | Faible | Moyen | Utiliser `pt-online-schema-change` ou `gh-ost` pour zero-downtime |

---

## 12. Dépendances et prérequis

- [ ] Redis 7.x accessible depuis toutes les instances backend (`REDIS_URL` env var)
- [ ] MySQL REPLICA configurée avec slave_net_timeout et lag < 500 ms mesuré
- [ ] Variables d'environnement ajoutées :
  - `REDIS_URL` (ex: `redis://redis:6379`)
  - `DB_PRIMARY_HOST`
  - `DB_REPLICA_HOST`
  - `DB_READ_USER`, `DB_READ_PASS`
- [ ] `@socket.io/redis-adapter` et `ioredis` installés (`npm install`)
- [ ] Index `IDX_chat_poste_activity` créé et vérifié avec `EXPLAIN`
- [ ] Index `IDX_msg_chat_status` créé et vérifié avec `EXPLAIN`
- [ ] Tests unitaires passent avant toute modification (`npm run test`)
- [ ] Branche dédiée créée depuis `master` (`git checkout -b feature/pagination-scale`)

---

## 13. Ce qui est hors périmètre

| Sujet | Raison de l'exclusion |
|-------|----------------------|
| Search full-text Elasticsearch | Feature future — non demandée |
| CQRS / Event Sourcing | Sur-ingénierie pour la volumétrie actuelle |
| Sharding MySQL | Partitionnement suffisant jusqu'à 1 Md lignes |
| CDN pour assets médias | Fonctionnalité existante non impactée |
| Rate limiting avancé (par tenant) | À prévoir en phase 2 si besoin |
| Migration vers PostgreSQL | Non demandée |
| gRPC inter-services | Non requis (monolithe modulaire actuel) |

---

*Document généré le 2026-04-06 — cible de charge : 1 000 000 conversations/jour*  
*Complète et enrichit `CDC_PAGINATION_INFINIE.md` v1.0*
