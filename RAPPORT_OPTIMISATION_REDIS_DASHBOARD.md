# Rapport d'optimisation — Dashboard commercial & Redis
**Date** : 2026-05-14  
**Périmètre** : Backend NestJS + TypeORM (MySQL) + Redis (ioredis) + Frontend React/Next.js  
**Contexte** : Système traitant des millions de messages par jour, base en croissance permanente

---

## 1. Diagnostic — Dashboard commercial (onglet front)

### 1.1 Flux de données

Quand un commercial ouvre le dashboard, le frontend déclenche **deux appels HTTP simultanés** :

```
GET /targets/ranking?period=month   → getRanking('month')
GET /targets/my-progress            → computeProgress() × nb objectifs
```

Puis le widget `RankingPositionWidget` peut déclencher jusqu'à **3 appels supplémentaires** selon la période sélectionnée (today / week / month).

### 1.2 Analyse des requêtes SQL exécutées par `getRanking()`

`getRanking()` exécute **5 requêtes parallèles** directement sur la table `whatsapp_message` (table la plus volumineuse du système), sans aucun cache.

#### Requête 1 — Conversations uniques par commercial

```sql
SELECT commercial_id, COUNT(DISTINCT chat_id) AS cnt
FROM whatsapp_message
WHERE commercial_id IS NOT NULL
  AND direction = 'OUT'
  AND created_at >= :start
  AND created_at < :end
  AND deleted_at IS NULL
GROUP BY commercial_id;
```

- **Index utilisé** : `IDX_msg_commercial_dir_time (commercial_id, direction, created_at)` ✅
- **Problème** : `COUNT(DISTINCT chat_id)` force un sort + dedup sur potentiellement des millions de lignes. Sur une période mensuelle avec 1M+ messages, cette opération peut dépasser 300ms.

#### Requête 2 — Messages envoyés totaux

```sql
SELECT commercial_id, COUNT(*) AS cnt
FROM whatsapp_message
WHERE commercial_id IS NOT NULL
  AND direction = 'OUT'
  AND created_at >= :start AND created_at < :end
  AND deleted_at IS NULL
GROUP BY commercial_id;
```

- **Index utilisé** : `IDX_msg_commercial_dir_time` ✅
- **Problème** : Requête quasi-identique à la R1. Aurait pu être fusionnée avec R1 en un seul `SELECT commercial_id, COUNT(*), COUNT(DISTINCT chat_id)`.

#### Requête 3 — Appels par commercial

```sql
SELECT commercial_id, COUNT(*) AS cnt
FROM call_log
WHERE commercial_id IS NOT NULL
  AND created_at >= :start AND created_at < :end
GROUP BY commercial_id;
```

- **Index utilisé** : `IDX_call_log_commercial_id` ✅ (partiel — pas de filtre `created_at` sur l'index)
- **Problème** : L'index `IDX_call_log_commercial_id` ne couvre pas `created_at`. MySQL fait un index scan + filter. Manque un index composite `(commercial_id, created_at)`.

#### Requête 4 — Follow-ups complétées

```sql
SELECT commercial_id, COUNT(*) AS cnt
FROM follow_up
WHERE commercial_id IS NOT NULL
  AND status = 'effectuee'
  AND completed_at >= :start AND completed_at < :end
GROUP BY commercial_id;
```

- **Index utilisé** : `IDX_follow_up_commercial_id` + `IDX_follow_up_status` (séparés) ⚠️
- **Problème** : MySQL ne peut utiliser qu'un seul index à la fois. Il choisira l'un des deux puis filtrera sur la colonne restante. Un index composite `(commercial_id, status, completed_at)` serait 3× plus rapide.

#### Requête 5 — Commandes (INNER JOIN critique)

```sql
SELECT m.commercial_id, COUNT(DISTINCT m.chat_id) AS cnt
FROM whatsapp_message m
INNER JOIN whatsapp_chat c
  ON c.chat_id = m.chat_id
  AND c.conversation_result IN ('commande_confirmee','commande_a_saisir')
  AND c.deleted_at IS NULL
WHERE m.commercial_id IS NOT NULL
  AND m.direction = 'OUT'
  AND m.created_at >= :start AND m.created_at < :end
  AND m.deleted_at IS NULL
GROUP BY m.commercial_id;
```

- **Index utilisé** : `IDX_msg_commercial_dir_time` sur `m` ✅, mais `whatsapp_chat` n'a pas d'index sur `conversation_result`
- **Problème** : C'est la requête la plus coûteuse. Le JOIN sur `whatsapp_chat` avec filtre sur `conversation_result` sans index dédié force un full scan de la table de chats pour chaque lot de messages. Sur 1M+ messages/mois, ce JOIN peut prendre 500ms+.

### 1.3 Analyse de `computeProgress()` (GET /targets/my-progress)

Pour chaque commercial et chaque objectif, `computeProgress()` re-exécute **les mêmes types de requêtes** que `getRanking()`, cette fois filtrées sur un seul commercial. Si un commercial a 5 objectifs actifs, ça fait **5 requêtes supplémentaires** sur `whatsapp_message`.

**Résultat** : À chaque ouverture du dashboard, le système exécute potentiellement **10+ requêtes** sur la table la plus volumineuse, sans cache, en temps réel.

### 1.4 Résumé des problèmes

| # | Problème | Impact | Priorité |
|---|---|---|---|
| P1 | Aucun cache Redis pour `getRanking()` | Chaque ouverture = 5 requêtes SQL lourdes | 🔴 Critique |
| P2 | R1 et R2 sont deux requêtes distinctes sur la même table | Double scan inutile | 🟠 Élevé |
| P3 | Pas d'index composite sur `call_log(commercial_id, created_at)` | Slow query sur filtre date | 🟠 Élevé |
| P4 | Pas d'index composite sur `follow_up(commercial_id, status, completed_at)` | Slow query multi-filter | 🟠 Élevé |
| P5 | JOIN `whatsapp_chat` sur `conversation_result` sans index | Requête la plus lente du lot | 🔴 Critique |
| P6 | `computeProgress()` rejoue les mêmes requêtes par objectif | N × requêtes pour N objectifs | 🟠 Élevé |
| P7 | Frontend peut déclencher jusqu'à 5 appels `/targets/ranking` | Charge × 5 si widget ouvert | 🟡 Moyen |

---

## 2. Inventaire Redis — État actuel

### 2.1 Architecture Redis en place

```
Redis (ioredis)
├── Présence agents         presence:commercial:{id}   TTL 45s
├── Présence postes         presence:poste:{id}         TTL 45s
├── Locks distribués        lock:{resource}             TTL variable
├── Cache config système    config:{key}                TTL 120s
├── Cache RBAC              rbac:perms:{tenant}:{id}    TTL 300s
├── Cache contexte canal    ctx:channel:{id}            TTL 60s
├── Cache templates WA      template:id:{id}            TTL 300s
│                           template:approved:{ch}:{n}  TTL 300s
├── Cache canal             channel:id:{id}             TTL variable
├── Cache socket/conv       socket:conversations:{p}:*  TTL 2s
│                           socket:contacts:{p}         TTL 10s
│                           queue:positions             TTL 3s
├── Rate limiting webhooks  rate:webhook:{scope}:*      TTL 1-60s
├── Rate limiting socket    throttle:socket:{c}:{e}     TTL variable
└── BullMQ queues
    ├── webhook-processing      (inbound webhooks)
    ├── broadcast-sending       (WhatsApp broadcasts)
    ├── outbound-webhook-delivery (webhooks sortants)
    ├── sentiment-analysis      (analyse sentiment async)
    ├── flowbot-delayed         (délais FlowBot)
    └── dead-letter             (jobs en échec)
```

### 2.2 Ce qui est bien fait

- **Dégradé gracieux** : tous les services ont un fallback in-process si Redis est absent — l'application ne tombe pas
- **Namespacing cohérent** : préfixes clairs (`presence:`, `lock:`, `config:`, `rbac:`, etc.)
- **TTL systématiques** : aucune clé sans expiration
- **Pipeline** : le rate limiting webhook utilise `pipeline().exec()` — bonne pratique
- **Socket.IO adapter** : les broadcasts WebSocket sont distribués via Redis → compatible multi-instance
- **BullMQ** : architecture robuste avec retry exponentiel, DLQ, et fallback in-process

### 2.3 Zones non couvertes (opportunités)

| Données | Fréquence d'accès | Cache actuel | Gain potentiel |
|---|---|---|---|
| Rankings commerciaux (`/targets/ranking`) | Élevée (chaque dashboard) | ❌ Aucun | 🔴 Très élevé |
| Progression objectifs (`/targets/my-progress`) | Élevée (chaque connexion) | ❌ Aucun | 🔴 Très élevé |
| Snapshots quotidiens | Moyenne | ❌ DB directe | 🟠 Élevé |
| SLA rules (dispatcher) | Très élevée (chaque message) | ❌ Aucun | 🟠 Élevé |
| Contact details (par conversation) | Très élevée | ❌ Aucun | 🟠 Élevé |
| FlowBot definitions | Élevée | ❌ Aucun | 🟡 Moyen |
| Conversations list (socket) | TTL 2s seulement | ⚠️ Très court | 🟡 Moyen |

---

## 3. Plan d'optimisation recommandé

### 3.1 Index SQL manquants (impact immédiat, sans code)

À exécuter directement en MySQL sur DB1 :

```sql
-- Index composite call_log : commercial + date
ALTER TABLE call_log
  ADD INDEX IDX_call_log_commercial_date (commercial_id, created_at);

-- Index composite follow_up : commercial + status + completed_at
ALTER TABLE follow_up
  ADD INDEX IDX_follow_up_commercial_status_completed (commercial_id, status, completed_at);

-- Index conversation_result pour accélérer le JOIN commandes
ALTER TABLE whatsapp_chat
  ADD INDEX IDX_chat_conversation_result (conversation_result, deleted_at);
```

**Gain estimé** : -40% à -60% sur le temps des requêtes R3, R4, R5.

### 3.2 Fusion des requêtes R1 + R2 (refactoring service)

Au lieu de deux passes sur `whatsapp_message` :

```typescript
// Avant : 2 requêtes
const uniqueConvs = await query1(); // COUNT DISTINCT
const totalMsgs   = await query2(); // COUNT *

// Après : 1 requête
const combined = await repo
  .createQueryBuilder('m')
  .select('m.commercial_id', 'commercial_id')
  .addSelect('COUNT(*)',              'messages_sent')
  .addSelect('COUNT(DISTINCT m.chat_id)', 'conversations')
  .where('m.commercial_id IS NOT NULL')
  .andWhere('m.direction = :dir', { dir: 'OUT' })
  .andWhere('m.createdAt >= :start', { start })
  .andWhere('m.createdAt < :end',   { end })
  .andWhere('m.deletedAt IS NULL')
  .groupBy('m.commercial_id')
  .getRawMany();
```

**Gain estimé** : suppression d'une requête lourde (−20% de charge DB sur getRanking).

### 3.3 Cache Redis pour le ranking (priorité maximale)

Le ranking mensuel ne change significativement que toutes les minutes. Le mettre en cache 60 secondes élimine 95%+ des requêtes SQL.

```typescript
// Dans targets.service.ts — getRanking()

private readonly RANKING_CACHE_TTL: Record<string, number> = {
  today: 30,   // 30s — données intrajournalières
  week:  60,   // 60s
  month: 120,  // 2min — données stables
};

async getRanking(period: 'today' | 'week' | 'month'): Promise<CommercialRankingEntry[]> {
  const cacheKey = `ranking:${period}`;
  const ttl      = this.RANKING_CACHE_TTL[period];

  if (this.redis) {
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CommercialRankingEntry[];
  }

  const result = await this.computeRanking(period); // logique actuelle

  if (this.redis) {
    await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
  }

  return result;
}
```

**Invalidation** : à déclencher depuis le snapshot cron (23h55) pour `today`, et à la fin d'une période pour `week`/`month`.

**Gain estimé** : économise 5 requêtes SQL par appel dashboard → −95% charge DB sur ce périmètre.

### 3.4 Cache Redis pour my-progress

```typescript
async getProgress(commercialId: string): Promise<TargetProgress[]> {
  const cacheKey = `progress:${commercialId}`;
  const TTL = 60; // 60s

  if (this.redis) {
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const result = await this.computeAllProgress(commercialId);

  if (this.redis) {
    await this.redis.setex(cacheKey, TTL, JSON.stringify(result));
  }

  return result;
}
```

**Invalidation** : à déclencher sur tout événement qui change la progression (message envoyé, appel enregistré, follow-up complété). Utiliser l'EventEmitter2 déjà en place :

```typescript
// Dans les listeners existants
this.eventEmitter.on('message.saved', ({ commercialId }) => {
  this.redis?.del(`progress:${commercialId}`);
  this.redis?.del('ranking:today');
  this.redis?.del('ranking:week');
  this.redis?.del('ranking:month');
});
```

### 3.5 Cache SLA rules (dispatcher — très haute fréquence)

Chaque message entrant lit les règles SLA en DB. À ~1M messages/jour = ~12 lectures/seconde.

```typescript
// Ajouter dans SlaService ou DispatcherService
private readonly SLA_CACHE_TTL = 300; // 5 min

async getSlaRules(channelId: string): Promise<SlaRule[]> {
  const key = `sla:rules:${channelId}`;
  if (this.redis) {
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);
  }
  const rules = await this.slaRepo.find({ where: { channelId, isActive: true } });
  if (this.redis) await this.redis.setex(key, this.SLA_CACHE_TTL, JSON.stringify(rules));
  return rules;
}
```

**Gain estimé** : −90% des requêtes SLA (invalidation sur modification de règle uniquement).

### 3.6 Allongement TTL socket:conversations

Le TTL actuel de 2s est trop court pour absorber les bursts. Avec un mécanisme d'invalidation événementielle, on peut passer à 10-30s :

```
socket:conversations:{posteId}:{cursorHash}   TTL 2s  →  10s
```

Couplé à une invalidation explicite sur `conversation.updated` / `message.saved` (via EventEmitter2 déjà en place), ce TTL plus long n'introduit pas de stale data visible.

### 3.7 Cache contacts fréquents

Les détails contact sont lus à chaque ouverture de conversation. Pour un système à forte volumétrie :

```
contact:{contactId}   TTL 300s   invalidé sur contact.updated
```

### 3.8 Namespace Redis — Convention recommandée

Adopter une convention stricte pour tous les nouveaux caches :

```
{domaine}:{entité}:{id}[:{variant}]

Exemples :
ranking:month                          → classement mensuel global
ranking:today                          → classement du jour
progress:{commercialId}               → objectifs d'un commercial
sla:rules:{channelId}                 → règles SLA d'un canal
contact:{contactId}                   → fiche contact
flow:def:{flowId}                     → définition d'un FlowBot
dispatch:rules:{tenantId}             → règles de dispatch
```

---

## 4. Récapitulatif des gains attendus

| Action | Effort | Gain DB | Gain temps chargement dashboard |
|---|---|---|---|
| Index `call_log(commercial_id, created_at)` | 5 min (SQL) | −40% R3 | −50ms |
| Index `follow_up(commercial_id, status, completed_at)` | 5 min (SQL) | −60% R4 | −80ms |
| Index `whatsapp_chat(conversation_result, deleted_at)` | 5 min (SQL) | −50% R5 | −200ms |
| Fusion requêtes R1+R2 | 1h (code) | −1 requête lourde | −150ms |
| Cache Redis `ranking:{period}` | 2h (code) | −95% requêtes ranking | −600ms |
| Cache Redis `progress:{commercialId}` | 1h (code) | −95% requêtes progress | −400ms |
| Cache Redis SLA rules | 1h (code) | −90% lectures SLA | impact global |
| TTL socket:conversations 2s→10s | 30 min (code) | −80% requêtes socket | −50ms burst |

**Gain total estimé sur le dashboard** : de ~1500ms → ~150ms (×10).

---

## 5. Recommandations architecture à moyen terme

### 5.1 Séparation lecture / écriture (Read Replica)

Avec des millions de messages/jour, envisager un replica MySQL dédié aux requêtes analytiques (ranking, progress, snapshots). TypeORM supporte la configuration `replication` :

```typescript
TypeOrmModule.forRoot({
  type: 'mysql',
  replication: {
    master: { host: MASTER_HOST, ... },
    slaves: [{ host: REPLICA_HOST, ... }],
  },
})
```

Les requêtes de ranking lisent des données qui tolèrent 1-2s de lag → parfait candidat pour replica.

### 5.2 Matérialisation des métriques (table dédiée)

Le snapshot quotidien (`commercial_daily_performance`) est un bon début. Étendre ce principe aux métriques intra-journalières avec un job `@Interval(5 * 60 * 1000)` (toutes les 5 min) qui pré-calcule les rankings et les stocke en table `commercial_realtime_metrics`. Le dashboard lirait cette table plutôt que `whatsapp_message` directement.

### 5.3 Durée de rétention Redis

Pour un système à forte volumétrie, surveiller la mémoire Redis. Configurer une politique d'éviction :

```
maxmemory-policy allkeys-lru
maxmemory 512mb  (ajuster selon infra)
```

Les clés sans TTL explicite (actuellement aucune dans le système) seraient évincées en LRU.

### 5.4 Monitoring Redis

Ajouter des métriques sur les hit/miss rates :

```typescript
const hit = await this.redis.get(key);
if (hit) {
  this.metrics.increment('redis.cache.hit', { key_prefix: namespace });
} else {
  this.metrics.increment('redis.cache.miss', { key_prefix: namespace });
}
```

Un hit rate < 80% sur un namespace indique un TTL trop court ou une invalidation trop agressive.

---

## 6. Ordre d'implémentation recommandé

```
Sprint immédiat (sans risque, impact direct)
├── ✅ Ajouter les 3 index SQL manquants
└── ✅ Fusionner R1+R2 dans getRanking()

Sprint court (1-2 jours)
├── ⬜ Cache Redis ranking + invalidation EventEmitter
├── ⬜ Cache Redis progress + invalidation EventEmitter
└── ⬜ TTL socket:conversations 2s → 10s

Sprint moyen (1 semaine)
├── ⬜ Cache Redis SLA rules
├── ⬜ Cache Redis contacts fréquents
└── ⬜ Monitoring hit/miss rates

Moyen terme (sprint dédié)
├── ⬜ Read replica MySQL pour analytics
└── ⬜ Table matérialisée métriques temps-réel
```

---

*Rapport généré le 2026-05-14 — Système : message_whatsapp (NestJS + TypeORM + MySQL + Redis ioredis)*
