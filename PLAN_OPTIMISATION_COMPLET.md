# Plan d'optimisation complet — Dashboard & Redis
**Basé sur** : `RAPPORT_OPTIMISATION_REDIS_DASHBOARD.md`  
**Date** : 2026-05-14  
**Système** : NestJS + TypeORM + MySQL + ioredis — millions de messages/jour

---

## Vue d'ensemble

| Phase | Page cible | Priorité | Effort | Gain estimé | Risque |
|-------|-----------|----------|--------|-------------|--------|
| **Phase 1** — Index SQL dashboard | Dashboard | 🔴 P0 | 15 min | −40 à −60% sur R3/R4/R5 | Nul (online DDL) |
| **Phase 2** — Fusion R1+R2 | Dashboard | 🔴 P0 | 1h | −1 requête lourde | Faible |
| **Phase 3** — Cache ranking | Dashboard | 🔴 P0 | 2h | −95% charge DB dashboard | Faible |
| **Phase 4** — Cache progress | Dashboard | 🟠 P1 | 1h30 | −95% requêtes progress | Faible |
| **Phase 5** — Cache SLA | Global | 🟠 P1 | 1h | −90% lectures SLA | Faible |
| **Phase 6** — TTL socket | Global | 🟡 P2 | 30 min | −80% requêtes socket burst | Faible |
| **Phase 7** — Cache contacts | Global | 🟡 P2 | 1h | gain global dispatcher | Faible |
| **Phase 8** — Architecture | Global | 🔵 P3 | Sprint dédié | scalabilité long terme | Moyen |
| **Phase 9** — Index + cache planning | Planning | 🟠 P1 | 1h | −70% sur findForCommercial | Faible |
| **Phase 10** — N+1 objectifs | Objectifs | 🔴 P0 | 2h | −95% requêtes progress admin | Faible |
| **Phase 11** — Cache classement analytics | Classement | 🟠 P1 | 1h30 | −90% charge getCommercialRanking | Faible |
| **Phase 12** — Outbox + ERP batch | Intégration ERP | 🟠 P1 | 2h | −80% requêtes sync nocturne | Faible |

**Gain total dashboard estimé** : 1 500ms → 150ms (×10)  
**Gain total autres pages estimé** : jusqu'à ×8 sur les endpoints analytics et planning

---

## Phase 1 — Index SQL manquants (PRIORITÉ MAXIMALE, zéro code)

### Contexte
Trois requêtes du `getRanking()` opèrent sur des colonnes non couvertes par les index existants.
`ALTER TABLE … ADD INDEX` en MySQL est non-bloquant en production (Online DDL InnoDB).

### 1.1 — Index composite `call_log`

**Problème** : requête R3 filtre sur `commercial_id` + `createdAt` mais l'index
`IDX_call_log_commercial_id` ne couvre que `commercial_id`. MySQL fait un index scan
complet + filtre date, ce qui est lent sur des millions de lignes.

**Fichier entité** : `message_whatsapp/src/call-log/entities/call_log.entity.ts`

**Modification TypeORM** (ligne 21-25, après les `@Index` existants) :
```typescript
// Avant
@Index('IDX_call_log_contact_id',    ['contact_id'])
@Index('IDX_call_log_commercial_id', ['commercial_id'])
@Index('IDX_call_log_called_at',     ['called_at'])

// Après — ajouter l'index composite
@Index('IDX_call_log_contact_id',          ['contact_id'])
@Index('IDX_call_log_commercial_id',       ['commercial_id'])
@Index('IDX_call_log_called_at',           ['called_at'])
@Index('IDX_call_log_commercial_createdat',['commercial_id', 'createdAt'])
```

**Migration SQL équivalente** :
```sql
ALTER TABLE call_log
  ADD INDEX IDX_call_log_commercial_createdat (commercial_id, createdAt);
```

---

### 1.2 — Index composite `follow_up`

**Problème** : requête R4 filtre sur `commercial_id` + `status = 'effectuee'` + `completed_at`.
Deux index séparés existent (`IDX_follow_up_commercial_id` et `IDX_follow_up_status`)
mais MySQL n'en utilise qu'un par requête → filtre de l'autre colonne en post-scan.

**Fichier entité** : `message_whatsapp/src/follow-up/entities/follow_up.entity.ts`

**Modification TypeORM** (ligne 27-31, après les `@Index` existants) :
```typescript
// Avant
@Index('IDX_follow_up_contact_id',    ['contact_id'])
@Index('IDX_follow_up_commercial_id', ['commercial_id'])
@Index('IDX_follow_up_scheduled_at',  ['scheduled_at'])
@Index('IDX_follow_up_status',        ['status'])

// Après — ajouter l'index composite covering
@Index('IDX_follow_up_contact_id',    ['contact_id'])
@Index('IDX_follow_up_commercial_id', ['commercial_id'])
@Index('IDX_follow_up_scheduled_at',  ['scheduled_at'])
@Index('IDX_follow_up_status',        ['status'])
@Index('IDX_follow_up_commercial_status_completed', ['commercial_id', 'status', 'completed_at'])
```

**Migration SQL équivalente** :
```sql
ALTER TABLE follow_up
  ADD INDEX IDX_follow_up_commercial_status_completed
    (commercial_id, status, completed_at);
```

---

### 1.3 — Index `whatsapp_chat.conversation_result`

**Problème** : requête R5 fait un `INNER JOIN whatsapp_chat` avec filtre
`conversation_result IN ('commande_confirmee','commande_a_saisir')`.
Aucun index sur `conversation_result` → full table scan sur chaque lot de messages.
C'est la requête la plus lente (~500ms+).

**Fichier entité** : `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Chercher les `@Index` existants et ajouter :
```typescript
@Index('IDX_chat_conversation_result', ['conversation_result', 'deletedAt'])
```

**Migration SQL équivalente** :
```sql
ALTER TABLE whatsapp_chat
  ADD INDEX IDX_chat_conversation_result (conversation_result, deleted_at);
```

---

### 1.4 — Migration TypeORM officielle

Créer le fichier :
`message_whatsapp/src/database/migrations/OptimisationIndexDashboard1778716800001.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexDashboard1778716800001 implements MigrationInterface {
  name = 'OptimisationIndexDashboard1778716800001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Index composite call_log : commercial + date de création
    await queryRunner.query(`
      ALTER TABLE \`call_log\`
        ADD INDEX \`IDX_call_log_commercial_createdat\` (\`commercial_id\`, \`createdAt\`)
    `);

    // Index composite follow_up : commercial + statut + date de complétion
    await queryRunner.query(`
      ALTER TABLE \`follow_up\`
        ADD INDEX \`IDX_follow_up_commercial_status_completed\`
          (\`commercial_id\`, \`status\`, \`completed_at\`)
    `);

    // Index whatsapp_chat : résultat conversation pour JOIN commandes
    await queryRunner.query(`
      ALTER TABLE \`whatsapp_chat\`
        ADD INDEX \`IDX_chat_conversation_result\`
          (\`conversation_result\`, \`deleted_at\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`call_log\`    DROP INDEX \`IDX_call_log_commercial_createdat\``);
    await queryRunner.query(`ALTER TABLE \`follow_up\`   DROP INDEX \`IDX_follow_up_commercial_status_completed\``);
    await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_conversation_result\``);
  }
}
```

---

## Phase 2 — Fusion des requêtes R1 + R2 dans `getRanking()`

### Contexte
`getRanking()` dans `message_whatsapp/src/targets/targets.service.ts` (lignes 90-112)
exécute deux requêtes quasi-identiques sur `whatsapp_message` :
- **R1** : `COUNT(DISTINCT chat_id)` → conversations uniques
- **R2** : `COUNT(*)` → messages envoyés totaux

Les deux ont les mêmes filtres (`commercial_id`, `direction`, `createdAt`, `deletedAt`).
Une seule passe suffit.

### Modification — `targets.service.ts` lignes 88-112

**Remplacer** :
```typescript
const convRows: Row[] = await this.messageRepo
  .createQueryBuilder('m')
  .select('m.commercial_id', 'commercial_id')
  .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
  .where('m.commercial_id IS NOT NULL')
  .andWhere('m.direction = :dir', { dir: 'OUT' })
  .andWhere('m.createdAt >= :start', { start })
  .andWhere('m.createdAt < :end', { end })
  .andWhere('m.deletedAt IS NULL')
  .groupBy('m.commercial_id')
  .getRawMany();

const msgRows: Row[] = await this.messageRepo
  .createQueryBuilder('m')
  .select('m.commercial_id', 'commercial_id')
  .addSelect('COUNT(*)', 'cnt')
  .where('m.commercial_id IS NOT NULL')
  .andWhere('m.direction = :dir', { dir: 'OUT' })
  .andWhere('m.createdAt >= :start', { start })
  .andWhere('m.createdAt < :end', { end })
  .andWhere('m.deletedAt IS NULL')
  .groupBy('m.commercial_id')
  .getRawMany();
```

**Par** :
```typescript
type MsgRow = { commercial_id: string; conv_cnt: string; msg_cnt: string };

const msgConvRows: MsgRow[] = await this.messageRepo
  .createQueryBuilder('m')
  .select('m.commercial_id',              'commercial_id')
  .addSelect('COUNT(DISTINCT m.chat_id)', 'conv_cnt')
  .addSelect('COUNT(*)',                  'msg_cnt')
  .where('m.commercial_id IS NOT NULL')
  .andWhere('m.direction = :dir', { dir: 'OUT' })
  .andWhere('m.createdAt >= :start', { start })
  .andWhere('m.createdAt < :end',   { end })
  .andWhere('m.deletedAt IS NULL')
  .groupBy('m.commercial_id')
  .getRawMany();
```

Puis **adapter** les deux Maps (lignes 169-173) :
```typescript
// Avant
const convMap  = toMap(convRows);
const msgMap   = toMap(msgRows);

// Après
const convMap = new Map(msgConvRows.map((r) => [r.commercial_id, parseInt(r.conv_cnt, 10) || 0]));
const msgMap  = new Map(msgConvRows.map((r) => [r.commercial_id, parseInt(r.msg_cnt,  10) || 0]));
```

Et **paralléliser** les 4 requêtes restantes avec `Promise.all` :
```typescript
// Remplacer les 4 await séquentiels par un Promise.all
const [msgConvRows, callRows, fuRows, orderRows] = await Promise.all([
  this.messageRepo.createQueryBuilder('m') /* requête fusionnée */.getRawMany(),
  this.callLogRepo.createQueryBuilder('cl') /* requête R3 */.getRawMany(),
  this.followUpRepo.createQueryBuilder('f') /* requête R4 */.getRawMany(),
  this.messageRepo.createQueryBuilder('m') /* requête R5 avec JOIN */.getRawMany(),
]);
```

---

## Phase 3 — Cache Redis pour `getRanking()` (impact maximal)

### Contexte
`getRanking()` est appelé à chaque ouverture du dashboard (2 appels minimum par session).
Aucun cache. Le ranking ne change de manière significative qu'à chaque nouveau message/appel.
Un cache TTL de 30-120s élimine 95%+ des requêtes SQL.

### 3.1 — Injecter Redis dans `TargetsModule`

**Fichier** : `message_whatsapp/src/targets/targets.module.ts`

```typescript
// Ajouter l'import
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([...]),
    SystemConfigModule,
    RedisModule,   // ← ajouter
  ],
  ...
})
export class TargetsModule {}
```

### 3.2 — Injecter Redis dans `TargetsService`

**Fichier** : `message_whatsapp/src/targets/targets.service.ts`

```typescript
// Ajouter les imports
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class TargetsService {
  constructor(
    // ... repos existants ...
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,   // ← ajouter
  ) {}
```

### 3.3 — Wraper `getRanking()` avec le cache

**Fichier** : `message_whatsapp/src/targets/targets.service.ts`

Renommer la méthode actuelle en `computeRanking()` et créer une nouvelle `getRanking()` :

```typescript
private readonly RANKING_TTL: Record<string, number> = {
  today: 30,    // 30s — change fréquemment en journée
  week:  60,    // 60s
  month: 120,   // 2 min — données stables sur le mois
};

async getRanking(period: 'today' | 'week' | 'month' = 'month'): Promise<CommercialRankingEntry[]> {
  const cacheKey = `ranking:${period}`;

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as CommercialRankingEntry[];
    } catch { /* Redis indisponible → fallback DB */ }
  }

  const result = await this.computeRanking(period);

  if (this.redis) {
    try {
      await this.redis.setex(cacheKey, this.RANKING_TTL[period], JSON.stringify(result));
    } catch { /* écriture cache non bloquante */ }
  }

  return result;
}

// Renommer l'ancienne getRanking() en computeRanking() — logique inchangée
private async computeRanking(period: 'today' | 'week' | 'month'): Promise<CommercialRankingEntry[]> {
  // ... code actuel inchangé ...
}
```

### 3.4 — Invalidation du cache ranking

Ajouter une méthode publique d'invalidation dans `TargetsService` :

```typescript
async invalidateRankingCache(): Promise<void> {
  if (!this.redis) return;
  try {
    await this.redis.del('ranking:today', 'ranking:week', 'ranking:month');
  } catch { /* non critique */ }
}
```

L'appeler depuis le snapshot cron dans `CommercialDailySnapshotService` :

**Fichier** : `message_whatsapp/src/targets/commercial-daily-snapshot.service.ts`

```typescript
// Dans computeAndStoreSnapshot() — après le upsert (fin de méthode)
await this.targetsService.invalidateRankingCache();
```

---

## Phase 4 — Cache Redis pour `getProgress()` (my-progress)

### Contexte
`getProgress(commercialId)` dans `targets.service.ts` (ligne 75-78) appelle
`computeProgress()` pour chaque objectif du commercial.
Si un commercial a 5 objectifs, ça déclenche 5 requêtes sur `whatsapp_message`.
Appelé à chaque connexion du commercial.

### 4.1 — Wraper `getProgress()` avec le cache

**Fichier** : `message_whatsapp/src/targets/targets.service.ts`

```typescript
private readonly PROGRESS_TTL = 60; // 60s par commercial

async getProgress(commercialId: string): Promise<TargetProgressDto[]> {
  const cacheKey = `progress:${commercialId}`;

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as TargetProgressDto[];
    } catch { /* fallback DB */ }
  }

  const targets = await this.findAll(commercialId);
  const result  = await Promise.all(targets.map((t) => this.buildProgress(t)));

  if (this.redis) {
    try {
      await this.redis.setex(cacheKey, this.PROGRESS_TTL, JSON.stringify(result));
    } catch { /* non bloquant */ }
  }

  return result;
}

async invalidateProgressCache(commercialId: string): Promise<void> {
  if (!this.redis) return;
  try {
    await this.redis.del(`progress:${commercialId}`);
  } catch { /* non critique */ }
}
```

### 4.2 — Invalidation événementielle de la progression

La progression change à chaque message envoyé, appel enregistré, ou follow-up complété.
Ces événements transitent déjà par l'EventEmitter2.

Créer un listener dans `TargetsModule` :

**Nouveau fichier** : `message_whatsapp/src/targets/targets-cache-invalidator.listener.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TargetsService } from './targets.service';

@Injectable()
export class TargetsCacheInvalidatorListener {
  constructor(private readonly targets: TargetsService) {}

  @OnEvent('message.saved')
  async onMessageSaved(payload: { commercialId?: string }) {
    if (payload.commercialId) {
      await this.targets.invalidateProgressCache(payload.commercialId);
    }
    await this.targets.invalidateRankingCache();
  }

  @OnEvent('call_log.created')
  async onCallCreated(payload: { commercial_id?: string }) {
    if (payload.commercial_id) {
      await this.targets.invalidateProgressCache(payload.commercial_id);
    }
    await this.targets.invalidateRankingCache();
  }

  @OnEvent('follow_up.completed')
  async onFollowUpCompleted(payload: { commercial_id?: string }) {
    if (payload.commercial_id) {
      await this.targets.invalidateProgressCache(payload.commercial_id);
    }
    await this.targets.invalidateRankingCache();
  }
}
```

Enregistrer le listener dans `TargetsModule` :

```typescript
providers: [TargetsService, CommercialDailySnapshotService, TargetsCacheInvalidatorListener],
```

---

## Phase 5 — Cache Redis pour les règles SLA

### Contexte
Chaque message entrant déclenche une vérification SLA dans le dispatcher.
À 1M+ messages/jour = ~12 lectures DB/seconde uniquement pour les règles SLA.
Les règles SLA changent rarement (modification manuelle par l'admin).

### 5.1 — Injecter Redis dans `SlaService`

**Fichier** : `message_whatsapp/src/sla/sla.module.ts`

```typescript
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaRule, ...]),
    RedisModule,   // ← ajouter
  ],
  ...
})
export class SlaModule {}
```

### 5.2 — Ajouter le cache dans `SlaService`

**Fichier** : `message_whatsapp/src/sla/sla.service.ts`

```typescript
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class SlaService {
  private readonly SLA_RULES_TTL = 300; // 5 min

  constructor(
    @InjectRepository(SlaRule) private readonly slaRepo: Repository<SlaRule>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    // ... autres dépendances existantes ...
  ) {}

  // Nouvelle méthode pour les consommateurs haute fréquence (dispatcher)
  async getActiveRules(tenantId: string): Promise<SlaRule[]> {
    const cacheKey = `sla:rules:${tenantId}`;

    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as SlaRule[];
      } catch { /* fallback DB */ }
    }

    const rules = await this.slaRepo.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { threshold_seconds: 'ASC' },
    });

    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, this.SLA_RULES_TTL, JSON.stringify(rules));
      } catch { /* non bloquant */ }
    }

    return rules;
  }

  // Invalider lors de toute modification de règle SLA
  private async invalidateSlaCache(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try { await this.redis.del(`sla:rules:${tenantId}`); } catch { /* ok */ }
  }

  // Appeler invalidateSlaCache() dans create(), update(), remove()
}
```

---

## Phase 6 — Allongement TTL `socket:conversations`

### Contexte
**Fichier** : `message_whatsapp/src/realtime/socket-list-cache.service.ts`

Le TTL actuel de `socket:conversations:{posteId}:{cursorHash}` est **2 secondes**.
À forte volumétrie, ce TTL entraîne un cache miss quasi-permanent et des requêtes DB
répétées lors des bursts de connexions simultanées.

Avec une invalidation événementielle sur `message.saved` et `conversation.updated`,
un TTL de **10 à 30 secondes** ne produira pas de données obsolètes visibles.

### Modification

**Fichier** : `message_whatsapp/src/realtime/socket-list-cache.service.ts`

```typescript
// Trouver la constante TTL conversations (valeur 2 ou 3)
// Remplacer :
private readonly CONVERSATIONS_TTL = 2;   // trop court

// Par :
private readonly CONVERSATIONS_TTL = 15;  // 15s avec invalidation événementielle
```

Ajouter une méthode d'invalidation dans le service :

```typescript
async invalidateConversations(posteId: string): Promise<void> {
  if (!this.redis) return;
  try {
    // Supprimer toutes les clés curseur pour ce poste
    const keys = await this.redis.keys(`socket:conversations:${posteId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  } catch { /* non critique */ }
}
```

L'appeler depuis les listeners `message.saved` et `conversation.updated` existants.

---

## Phase 7 — Cache contacts haute fréquence

### Contexte
Les détails d'un contact sont lus à chaque ouverture de conversation et à chaque
message entrant (résolution du contact). Sur un système à forte volumétrie,
c'est plusieurs dizaines de lectures par seconde.

### Modification

**Fichier** : `message_whatsapp/src/contact/contact.service.ts` (ou service équivalent)

```typescript
private readonly CONTACT_TTL = 300; // 5 min

async findById(contactId: string): Promise<Contact | null> {
  const cacheKey = `contact:${contactId}`;

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Contact;
    } catch { /* fallback DB */ }
  }

  const contact = await this.contactRepo.findOne({ where: { id: contactId } });

  if (contact && this.redis) {
    try {
      await this.redis.setex(cacheKey, this.CONTACT_TTL, JSON.stringify(contact));
    } catch { /* non bloquant */ }
  }

  return contact;
}

async invalidateContact(contactId: string): Promise<void> {
  if (!this.redis) return;
  try { await this.redis.del(`contact:${contactId}`); } catch { /* ok */ }
}
```

---

## Phase 8 — Architecture long terme

### 8.1 — Read Replica MySQL pour les analytics

Quand la volumétrie dépasse la capacité du serveur principal, router les requêtes
de lecture analytique (ranking, progress, snapshots) vers un replica dédié.

**Fichier** : `message_whatsapp/src/database/database.module.ts`

```typescript
return {
  type: 'mysql' as const,
  replication: {
    master: {
      host:     configService.get<string>('MYSQL_HOST'),
      port:     configService.get<number>('MYSQL_PORT'),
      username: configService.get<string>('MYSQL_USER'),
      password: configService.get<string>('MYSQL_PASSWORD'),
      database: configService.get<string>('MYSQL_DATABASE'),
    },
    slaves: [
      {
        host:     configService.get<string>('MYSQL_REPLICA_HOST') || configService.get<string>('MYSQL_HOST'),
        port:     configService.get<number>('MYSQL_REPLICA_PORT') || configService.get<number>('MYSQL_PORT'),
        username: configService.get<string>('MYSQL_USER'),
        password: configService.get<string>('MYSQL_PASSWORD'),
        database: configService.get<string>('MYSQL_DATABASE'),
      },
    ],
  },
  // ... reste config inchangée
};
```

Variables d'environnement à ajouter :
```
MYSQL_REPLICA_HOST=replica-host
MYSQL_REPLICA_PORT=3306
```

### 8.2 — Table matérialisée `commercial_realtime_metrics`

Étendre le snapshot quotidien pour avoir des snapshots intra-journaliers (toutes les 5 min).
Le dashboard lirait cette table au lieu de `whatsapp_message`.

**Nouveau job** dans `CommercialDailySnapshotService` :

```typescript
// Calcul toutes les 5 minutes (hors du cron nocturne)
@Interval(5 * 60 * 1000)
async computeRealtimeSnapshot(): Promise<void> {
  const entries = await this.targetsService.computeRanking('today');
  // Upsert dans commercial_realtime_metrics avec timestamp
}
```

Le dashboard lirait `/targets/ranking?period=today` depuis cette table,
pas depuis `whatsapp_message` directement.

### 8.3 — Configuration Redis recommandée en production

Ajouter dans `redis.conf` ou via variables d'environnement Docker :

```
# Politique d'éviction : LRU sur toutes les clés (pas seulement les volatile)
maxmemory-policy allkeys-lru

# Mémoire allouée (ajuster selon le serveur)
maxmemory 512mb

# Activer les keyspace events pour AgentPresenceService (déjà utilisé)
notify-keyspace-events "Ex"

# Persistence : RDB + AOF pour durabilité BullMQ
appendonly yes
save 900 1
save 300 10
save 60 10000
```

### 8.4 — Monitoring hit/miss rate Redis

Créer un helper réutilisable dans `message_whatsapp/src/redis/` :

```typescript
// message_whatsapp/src/redis/redis-cache.helper.ts
export async function cachedGet<T>(
  redis: Redis | null,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
  namespace?: string,
): Promise<T> {
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        // Incrémenter compteur hit (optionnel : utiliser redis.incr(`metrics:cache:hit:${namespace}`))
        return JSON.parse(cached) as T;
      }
    } catch { /* fallback */ }
  }

  const value = await loader();

  if (redis && value !== null && value !== undefined) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch { /* non bloquant */ }
  }

  return value;
}
```

Usage simplifié dans tous les services :

```typescript
return cachedGet(this.redis, `ranking:${period}`, ttl, () => this.computeRanking(period));
return cachedGet(this.redis, `sla:rules:${tenantId}`, 300, () => this.loadSlaRules(tenantId));
return cachedGet(this.redis, `contact:${contactId}`, 300, () => this.contactRepo.findOne(...));
```

---

---

## Phase 9 — Planning (page « Équipe et planning »)

### Contexte

La page **planning** affiche les horaires effectifs de chaque commercial via
`WorkScheduleService.findForCommercial()` (`src/work-schedule/work-schedule.service.ts`
lignes 61-93) et les statistiques de sessions via `CommercialSessionService.getStats()`.

**Problèmes identifiés** :

1. `findForCommercial()` exécute **3 requêtes séquentielles** :
   - `commercialRepo.findOne({ relations: ['poste'] })` → résoudre `poste_id`
   - `repo.find({ where: { commercialId, isActive: true } })` → planning individuel
   - `repo.find({ where: { groupId: posteId, isActive: true } })` → planning du groupe

2. L'entité `work_schedule` n'a que deux index simples `IDX_ws_commercial_id` et
   `IDX_ws_group_id`. Les deux requêtes de planning filtrent aussi sur `isActive = true`
   sans index composite → scan sur toutes les lignes de l'index avant filtre booléen.

3. `getActiveGroupIds()` (lignes 106-126) filtre sur `(groupId NOT NULL, dayOfWeek, isActive)`
   sans index couvrant — appelé par `OrderCallSyncService` à chaque appel entrant.

4. `CommercialSessionService.closeOpenSessions()` (ligne 40-53) charge toutes les sessions
   ouvertes d'un commercial sans index composite sur `(commercial_id, disconnected_at)`.

---

### 9.1 — Index composites `work_schedule`

**Fichier entité** : `message_whatsapp/src/work-schedule/entities/work-schedule.entity.ts`

```typescript
// Avant (lignes 6-8)
@Entity('work_schedule')
@Index('IDX_ws_commercial_id', ['commercialId'])
@Index('IDX_ws_group_id',      ['groupId'])

// Après — index composites couvrants
@Entity('work_schedule')
@Index('IDX_ws_commercial_id',            ['commercialId'])
@Index('IDX_ws_group_id',                 ['groupId'])
@Index('IDX_ws_commercial_active',        ['commercialId', 'isActive'])
@Index('IDX_ws_group_active_day',         ['groupId', 'dayOfWeek', 'isActive'])
```

**Migration SQL équivalente** :
```sql
ALTER TABLE `work_schedule`
  ADD INDEX `IDX_ws_commercial_active`  (`commercial_id`, `is_active`),
  ADD INDEX `IDX_ws_group_active_day`   (`group_id`, `day_of_week`, `is_active`);
```

---

### 9.2 — Index composite `commercial_session`

**Fichier entité** : `message_whatsapp/src/commercial-session/entities/commercial_session.entity.ts`

Chercher les `@Index` existants et ajouter :

```typescript
@Index('IDX_sess_commercial_connected', ['commercial_id', 'connected_at'])
```

**Migration SQL** :
```sql
ALTER TABLE `commercial_session`
  ADD INDEX `IDX_sess_commercial_connected` (`commercial_id`, `connected_at`);
```

---

### 9.3 — Fusion des 3 requêtes `findForCommercial()` en 2

Éviter la 3ème requête séquentielle en passant `posteId` directement si déjà connu,
ou en fusionnant les lookups avec une requête OR :

**Fichier** : `message_whatsapp/src/work-schedule/work-schedule.service.ts`

```typescript
async findForCommercial(commercialId: string, posteIdHint?: string): Promise<WorkScheduleDay[]> {
  // Si posteIdHint fourni (depuis le contexte appelant), on évite le 1er SELECT
  let posteId = posteIdHint ?? null;

  if (!posteId) {
    const commercial = await this.commercialRepo.findOne({
      where:   { id: commercialId },
      select:  ['id'],
      relations: ['poste'],
    });
    posteId = commercial?.poste?.id ?? null;
  }

  // Charger individuel + groupe en parallèle au lieu de séquentiel
  const [individual, group] = await Promise.all([
    this.repo.find({ where: { commercialId, isActive: true } }),
    posteId
      ? this.repo.find({ where: { groupId: posteId, isActive: true } })
      : Promise.resolve([]),
  ]);

  // ... reste inchangé
}
```

---

### 9.4 — Cache Redis pour `findForCommercial()`

Le planning d'un commercial ne change que sur modification admin (PUT/DELETE).
Un cache TTL 300s avec invalidation explicite est approprié.

**Fichier** : `message_whatsapp/src/work-schedule/work-schedule.service.ts`

```typescript
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

private readonly SCHEDULE_TTL = 300; // 5 min

async findForCommercial(commercialId: string): Promise<WorkScheduleDay[]> {
  const cacheKey = `schedule:commercial:${commercialId}`;

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as WorkScheduleDay[];
    } catch { /* fallback DB */ }
  }

  const result = await this.computeForCommercial(commercialId);

  if (this.redis) {
    try {
      await this.redis.setex(cacheKey, this.SCHEDULE_TTL, JSON.stringify(result));
    } catch { /* non bloquant */ }
  }

  return result;
}

// Dans update() et remove() — invalider le cache
private async invalidateScheduleCache(commercialId?: string | null, groupId?: string | null): Promise<void> {
  if (!this.redis) return;
  try {
    const keys: string[] = [];
    if (commercialId) keys.push(`schedule:commercial:${commercialId}`);
    if (groupId) {
      // Invalider tous les caches commercial pointant vers ce groupe (pattern)
      const groupKeys = await this.redis.keys(`schedule:commercial:*`);
      keys.push(...groupKeys); // simple : invalider tous les plannings si groupe modifié
    }
    if (keys.length > 0) await this.redis.del(...keys);
  } catch { /* ok */ }
}
```

### 9.5 — Migration

Ajouter dans `OptimisationIndexPlanning1778716800009.ts` :

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexPlanning1778716800009 implements MigrationInterface {
  name = 'OptimisationIndexPlanning1778716800009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`work_schedule\`
        ADD INDEX \`IDX_ws_commercial_active\`  (\`commercial_id\`, \`is_active\`),
        ADD INDEX \`IDX_ws_group_active_day\`   (\`group_id\`, \`day_of_week\`, \`is_active\`)
    `);
    await queryRunner.query(`
      ALTER TABLE \`commercial_session\`
        ADD INDEX \`IDX_sess_commercial_connected\` (\`commercial_id\`, \`connected_at\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX \`IDX_ws_commercial_active\``);
    await queryRunner.query(`ALTER TABLE \`work_schedule\` DROP INDEX \`IDX_ws_group_active_day\``);
    await queryRunner.query(`ALTER TABLE \`commercial_session\` DROP INDEX \`IDX_sess_commercial_connected\``);
  }
}
```

---

## Phase 10 — Objectifs CRM (page « CRM et relances »)

### Contexte

La page **objectifs** appelle `GET /targets/progress/all` qui déclenche
`TargetsService.getProgressAll()` (`src/targets/targets.service.ts` lignes 80-83).

**Problème critique N+1** :

```
getProgressAll()
  └─ findAll()                          → 1 requête SELECT (tous les objectifs)
  └─ Promise.all(targets.map(buildProgress))
       └─ buildProgress(t)              × N objectifs
            └─ computeProgress(t)       → 1 requête par objectif
                                          (whatsapp_message, call_log, follow_up ou report)
```

Avec 20 commerciaux × 4 objectifs chacun = **80 requêtes SQL en parallèle** sur
`whatsapp_message` à chaque appel de la page — c'est la cause principale de la lenteur.

---

### 10.1 — Batch des requêtes de progression par type de métrique

Au lieu de 1 requête par objectif, grouper tous les objectifs du même type
et faire **1 requête** retournant tous les résultats à la fois.

**Fichier** : `message_whatsapp/src/targets/targets.service.ts`

```typescript
async getProgressAll(): Promise<TargetProgressDto[]> {
  const targets = await this.findAll();
  if (targets.length === 0) return [];

  // Grouper par (metric, periodType, periodStart) pour batcher les requêtes SQL
  return this.computeProgressBatch(targets);
}

async getProgress(commercialId: string): Promise<TargetProgressDto[]> {
  const targets = await this.findAll(commercialId);
  if (targets.length === 0) return [];
  return this.computeProgressBatch(targets);
}

private async computeProgressBatch(targets: CommercialTarget[]): Promise<TargetProgressDto[]> {
  // Collecter tous les commercial_id × période concernés
  const allIds = [...new Set(targets.map((t) => t.commercial_id))];

  // Calculer le range min/max global pour n'avoir qu'une seule passe par métrique
  const dates = targets.flatMap((t) => {
    const { start, end } = this.periodRange(t);
    return [start, end];
  });
  const globalStart = new Date(Math.min(...dates.map((d) => d.getTime())));
  const globalEnd   = new Date(Math.max(...dates.map((d) => d.getTime())));

  // 1 requête par type de métrique pour tous les commerciaux concernés
  type MetricRow = { commercial_id: string; period_key: string; cnt: string };

  // Conversations : COUNT(DISTINCT chat_id) groupé par commercial + tranche de date
  // On récupère les agrégats journaliers et on les somme côté applicatif
  const [convRows, callRows, fuRows, orderRows, reportRows] = await Promise.all([
    // Conversations
    this.messageRepo
      .createQueryBuilder('m')
      .select('m.commercial_id', 'commercial_id')
      .addSelect('DATE(m.createdAt)', 'day')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
      .where('m.commercial_id IN (:...allIds)', { allIds })
      .andWhere('m.direction = :dir', { dir: 'OUT' })
      .andWhere('m.createdAt >= :globalStart', { globalStart })
      .andWhere('m.createdAt < :globalEnd', { globalEnd })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.commercial_id, DATE(m.createdAt)')
      .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

    // Appels
    this.callLogRepo
      .createQueryBuilder('cl')
      .select('cl.commercial_id', 'commercial_id')
      .addSelect('DATE(cl.createdAt)', 'day')
      .addSelect('COUNT(*)', 'cnt')
      .where('cl.commercial_id IN (:...allIds)', { allIds })
      .andWhere('cl.createdAt >= :globalStart', { globalStart })
      .andWhere('cl.createdAt < :globalEnd', { globalEnd })
      .groupBy('cl.commercial_id, DATE(cl.createdAt)')
      .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

    // Relances
    this.followUpRepo
      .createQueryBuilder('f')
      .select('f.commercial_id', 'commercial_id')
      .addSelect('DATE(f.completed_at)', 'day')
      .addSelect('COUNT(*)', 'cnt')
      .where('f.commercial_id IN (:...allIds)', { allIds })
      .andWhere("f.status = 'effectuee'")
      .andWhere('f.completed_at >= :globalStart', { globalStart })
      .andWhere('f.completed_at < :globalEnd', { globalEnd })
      .groupBy('f.commercial_id, DATE(f.completed_at)')
      .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

    // Commandes
    this.messageRepo
      .createQueryBuilder('m')
      .innerJoin(
        'whatsapp_chat', 'c',
        `c.chat_id = m.chat_id AND c.conversation_result IN ('commande_confirmee','commande_a_saisir') AND c.deletedAt IS NULL`,
      )
      .select('m.commercial_id', 'commercial_id')
      .addSelect('DATE(m.createdAt)', 'day')
      .addSelect('COUNT(DISTINCT m.chat_id)', 'cnt')
      .where('m.commercial_id IN (:...allIds)', { allIds })
      .andWhere('m.direction = :dir', { dir: 'OUT' })
      .andWhere('m.createdAt >= :globalStart', { globalStart })
      .andWhere('m.createdAt < :globalEnd', { globalEnd })
      .andWhere('m.deletedAt IS NULL')
      .groupBy('m.commercial_id, DATE(m.createdAt)')
      .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),

    // Rapports soumis
    this.reportRepo
      .createQueryBuilder('r')
      .select('r.commercialId', 'commercial_id')
      .addSelect('DATE(r.submittedAt)', 'day')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.commercialId IN (:...allIds)', { allIds })
      .andWhere('r.isSubmitted = true')
      .andWhere('r.submittedAt >= :globalStart', { globalStart })
      .andWhere('r.submittedAt < :globalEnd', { globalEnd })
      .groupBy('r.commercialId, DATE(r.submittedAt)')
      .getRawMany<{ commercial_id: string; day: string; cnt: string }>(),
  ]);

  // Construire des Maps (commercial_id, day) → count pour agréger côté JS
  const toAggMap = (rows: { commercial_id: string; day: string; cnt: string }[]) => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!m.has(r.commercial_id)) m.set(r.commercial_id, new Map());
      m.get(r.commercial_id)!.set(r.day, parseInt(r.cnt, 10) || 0);
    }
    return m;
  };

  const convAgg    = toAggMap(convRows);
  const callAgg    = toAggMap(callRows);
  const fuAgg      = toAggMap(fuRows);
  const orderAgg   = toAggMap(orderRows);
  const reportAgg  = toAggMap(reportRows);

  // Sommer les jours dans la plage de chaque objectif
  const sumInRange = (
    aggMap: Map<string, Map<string, number>>,
    commercialId: string,
    start: Date,
    end: Date,
  ): number => {
    const dayMap = aggMap.get(commercialId);
    if (!dayMap) return 0;
    let total = 0;
    const cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toISOString().slice(0, 10); // YYYY-MM-DD
      total += dayMap.get(key) ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  };

  return targets.map((target) => {
    const { start, end } = this.periodRange(target);
    let current_value = 0;

    switch (target.metric) {
      case TargetMetric.Conversations:   current_value = sumInRange(convAgg,   target.commercial_id, start, end); break;
      case TargetMetric.Calls:           current_value = sumInRange(callAgg,   target.commercial_id, start, end); break;
      case TargetMetric.FollowUps:
      case TargetMetric.Relances:        current_value = sumInRange(fuAgg,     target.commercial_id, start, end); break;
      case TargetMetric.Orders:          current_value = sumInRange(orderAgg,  target.commercial_id, start, end); break;
      case TargetMetric.ReportsSubmitted:current_value = sumInRange(reportAgg, target.commercial_id, start, end); break;
    }

    const progress_pct = target.target_value > 0
      ? Math.round((current_value / target.target_value) * 100)
      : 0;

    return { target, current_value, progress_pct, period_label: this.periodLabel(target) };
  });
}
```

**Résultat** : 1 + N requêtes → **1 + 5 requêtes** (constant, quelle que soit la taille de l'équipe).

---

### 10.2 — Cache Redis pour `getProgressAll()`

```typescript
private readonly PROGRESS_ALL_TTL = 60; // 60s — suffisant pour la page admin

async getProgressAll(): Promise<TargetProgressDto[]> {
  const cacheKey = 'progress:all';

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as TargetProgressDto[];
    } catch { /* fallback DB */ }
  }

  const targets = await this.findAll();
  if (targets.length === 0) return [];
  const result = await this.computeProgressBatch(targets);

  if (this.redis) {
    try {
      await this.redis.setex(cacheKey, this.PROGRESS_ALL_TTL, JSON.stringify(result));
    } catch { /* non bloquant */ }
  }

  return result;
}

async invalidateProgressAllCache(): Promise<void> {
  if (!this.redis) return;
  try { await this.redis.del('progress:all'); } catch { /* ok */ }
}
```

L'appeler depuis `TargetsCacheInvalidatorListener` (voir Phase 4) :

```typescript
@OnEvent('message.saved')
async onMessageSaved(payload: { commercialId?: string }) {
  if (payload.commercialId) await this.targets.invalidateProgressCache(payload.commercialId);
  await this.targets.invalidateRankingCache();
  await this.targets.invalidateProgressAllCache(); // ← ajouter
}
```

---

## Phase 11 — Classement Analytics (page « Analyse et performance »)

### Contexte

La page **classement** appelle `GET /admin/analytics/ranking` qui déclenche
`AnalyticsService.getCommercialRanking()` (`src/analytics/analytics.service.ts`
lignes 342-458).

**Problèmes identifiés** :

1. **Self-join lourd** sur `whatsapp_message` pour calculer le temps de première réponse
   (lignes 402-421) : `INNER JOIN whatsapp_message msg_in … AND msg_in.timestamp >= msg_out.timestamp - INTERVAL 2 HOUR`
   — sur des millions de lignes, ce join cartésien intra-table est la requête la plus lente.

2. Absence de cache : cette requête tourne à chaque chargement de page, sur une plage
   de 30 jours par défaut.

3. `getSummary()` (lignes 95-175) contient le même self-join (lignes 128-147)
   — même problème, même solution.

---

### 11.1 — Cache Redis pour `getCommercialRanking()`

**Fichier** : `message_whatsapp/src/analytics/analytics.service.ts`

```typescript
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class AnalyticsService {
  private readonly RANKING_TTL = 120; // 2 min — données analytiques non temps-réel

  constructor(
    // ... repos existants ...
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null,
  ) {}

  async getCommercialRanking(from?: string, to?: string): Promise<CommercialRankingDto[]> {
    const cacheKey = `analytics:ranking:${from ?? 'default'}:${to ?? 'default'}`;

    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as CommercialRankingDto[];
      } catch { /* fallback DB */ }
    }

    const result = await this.computeCommercialRanking(from, to);

    if (this.redis) {
      try {
        await this.redis.setex(cacheKey, this.RANKING_TTL, JSON.stringify(result));
      } catch { /* non bloquant */ }
    }

    return result;
  }

  // Renommer le corps actuel en computeCommercialRanking()
  private async computeCommercialRanking(from?: string, to?: string): Promise<CommercialRankingDto[]> {
    // ... code actuel inchangé ...
  }
}
```

**Ajouter `RedisModule` dans `AnalyticsModule`** :

```typescript
// src/analytics/analytics.module.ts
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([...]),
    RedisModule,   // ← ajouter
  ],
  ...
})
export class AnalyticsModule {}
```

---

### 11.2 — Cache Redis pour `getSummary()`

Même pattern, TTL 60s (le summary est consulté plus fréquemment) :

```typescript
async getSummary(tenantId: string, from?: string, to?: string): Promise<AnalyticsSummaryDto> {
  const cacheKey = `analytics:summary:${tenantId}:${from ?? ''}:${to ?? ''}`;

  if (this.redis) {
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as AnalyticsSummaryDto;
    } catch { /* fallback */ }
  }

  const result = await this.computeSummary(tenantId, from, to);

  if (this.redis) {
    try {
      await this.redis.setex(cacheKey, 60, JSON.stringify(result));
    } catch { /* ok */ }
  }

  return result;
}
```

---

### 11.3 — Index couvrant pour le self-join temps de réponse

Le self-join `msg_out.timestamp ≥ msg_in.timestamp - 2H` a besoin d'un index couvrant
`(chat_id, direction, timestamp)` pour éviter le full scan :

**Fichier entité** : `message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity.ts`

Chercher les `@Index` existants et ajouter :

```typescript
@Index('IDX_msg_chat_dir_timestamp', ['chat_id', 'direction', 'timestamp'])
```

**Migration SQL** :
```sql
ALTER TABLE `whatsapp_message`
  ADD INDEX `IDX_msg_chat_dir_timestamp` (`chat_id`, `direction`, `timestamp`);
```

> Ce même index bénéficie également à `AnalyticsService.getAgentPerformance()` et
> `getSummary()` qui font le même self-join.

---

### 11.4 — Migration

`message_whatsapp/src/database/migrations/OptimisationIndexAnalytics1778716800011.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexAnalytics1778716800011 implements MigrationInterface {
  name = 'OptimisationIndexAnalytics1778716800011';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`whatsapp_message\`
        ADD INDEX \`IDX_msg_chat_dir_timestamp\` (\`chat_id\`, \`direction\`, \`timestamp\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_message\` DROP INDEX \`IDX_msg_chat_dir_timestamp\``,
    );
  }
}
```

---

## Phase 12 — Intégration ERP (page « Intégration et GICOP »)

### Contexte

La page **intégration ERP** surveille la file `integration_outbox` et le job de sync
nocturne `ErpClientSyncService.syncErpClients()`.

**Problèmes identifiés** :

1. **Race condition dans `claimBatch()`** (`src/integration-outbox/integration-outbox.service.ts`
   lignes 47-68) : SELECT des entrées à traiter puis UPDATE séparé — en environnement
   multi-instance (scalabilité horizontale future), deux instances peuvent claimer
   le même lot simultanément.

2. **N+1 dans `syncErpClients()`** (`src/erp-client-sync/erp-client-sync.service.ts`
   lignes 71-128) : pour chaque client dans un chunk de 100 :
   - 1 appel `resolveCategoryByClientId()` → 1 requête DB2
   - 1 `contactRepo.findOne({ where: { phone } })` → 1 requête DB1
   - 1 `update()` ou `save()` → 1 requête DB1
   = **3 requêtes × N clients** pour un job qui traite potentiellement 10 000+ clients.

3. **Index manquant sur `contact.order_client_id`** : la méthode `refreshStaleCategories()`
   (lignes 149-183) charge tous les contacts avec `order_client_id NOT NULL` — pas d'index
   sur cette colonne → full scan.

---

### 12.1 — Fix race condition `claimBatch()` avec pessimistic lock

**Fichier** : `message_whatsapp/src/integration-outbox/integration-outbox.service.ts`

```typescript
async claimBatch(limit = 20): Promise<IntegrationOutbox[]> {
  const now = new Date();

  // Utiliser une transaction avec FOR UPDATE SKIP LOCKED pour éviter les race conditions
  return this.repo.manager.transaction(async (manager) => {
    const entries = await manager
      .createQueryBuilder(IntegrationOutbox, 'o')
      .setLock('pessimistic_write_or_fail')  // FOR UPDATE SKIP LOCKED en MySQL 8+
      .where('o.status = :pending', { pending: 'pending' })
      .orWhere(
        '(o.status = :failed AND (o.nextRetryAt IS NULL OR o.nextRetryAt <= :now))',
        { failed: 'failed', now },
      )
      .orderBy('o.createdAt', 'ASC')
      .take(limit)
      .getMany();

    if (entries.length === 0) return [];

    await manager.update(
      IntegrationOutbox,
      { id: In(entries.map((e) => e.id)) },
      { status: 'processing' },
    );

    return entries;
  });
}
```

> Note : `pessimistic_write_or_fail` correspond à `FOR UPDATE SKIP LOCKED` dans MySQL 8+.
> Avec MySQL 5.7, utiliser `pessimistic_write` (FOR UPDATE sans SKIP LOCKED).
> Vérifier la version MySQL avant d'appliquer.

---

### 12.2 — Batch lookup des contacts dans `syncErpClients()`

Au lieu de 1 `findOne` par client, charger tous les contacts du chunk en une seule requête.

**Fichier** : `message_whatsapp/src/erp-client-sync/erp-client-sync.service.ts`

```typescript
for (let i = 0; i < db2Clients.length; i += CHUNK_SIZE) {
  const chunk = db2Clients.slice(i, i + CHUNK_SIZE);

  // Normaliser tous les numéros du chunk
  const phonePairs: Array<{ client: typeof chunk[0]; normalized: string }> = [];
  for (const client of chunk) {
    const rawPhone = client.phone ?? client.phone2;
    if (!rawPhone) continue;
    const normalized = normalizePhone(rawPhone);
    if (!normalized) continue;
    phonePairs.push({ client, normalized });
  }

  if (phonePairs.length === 0) continue;

  // 1 seul SELECT pour tout le chunk au lieu de N SELECT
  const normalizedPhones = phonePairs.map((p) => p.normalized);
  const existingContacts = await this.contactRepo.find({
    where:  { phone: In(normalizedPhones) },
    select: ['id', 'phone', 'contactSource', 'client_category', 'order_client_id'],
  });
  const existingByPhone = new Map(existingContacts.map((c) => [c.phone, c]));

  // Résoudre toutes les catégories en parallèle (DB2)
  const categoryResults = await Promise.allSettled(
    phonePairs.map(({ client }) =>
      this.orderCallSyncService.resolveCategoryByClientId(client.id, this.orderDb!),
    ),
  );

  // Préparer les upserts en batch
  for (let j = 0; j < phonePairs.length; j++) {
    const { client, normalized } = phonePairs[j];
    const catResult = categoryResults[j];
    if (catResult.status === 'rejected') { errors++; continue; }

    const clientCategory = catResult.value as unknown as ClientCategory;
    const existing = existingByPhone.get(normalized);

    try {
      if (existing) {
        await this.contactRepo.update(existing.id, {
          client_category: clientCategory,
          order_client_id: client.id,
        });
        updated++;
      } else {
        const fullName = [client.prenoms, client.nom].filter(Boolean).join(' ').trim() || normalized;
        await this.contactRepo.save(
          this.contactRepo.create({
            phone:            normalized,
            name:             fullName,
            contactSource:    ContactSource.ErpImport,
            order_client_id:  client.id,
            client_category:  clientCategory,
            call_status:      CallStatus.À_APPeler,
            conversion_status: 'client',
          }),
        );
        created++;
      }
    } catch (err) {
      errors++;
      this.logger.warn(`syncErpClients erreur client DB2 id=${client.id}: ${(err as Error).message}`);
    }
  }
}
```

**Résultat** : N `findOne` → **1 `find` avec `IN`** par chunk de 100.

---

### 12.3 — Index manquant sur `contact.order_client_id`

**Fichier entité** : `message_whatsapp/src/contact/entities/contact.entity.ts`

Chercher les `@Index` existants et ajouter :

```typescript
@Index('IDX_contact_order_client_id', ['order_client_id'])
```

**Migration SQL** :
```sql
ALTER TABLE `contact`
  ADD INDEX `IDX_contact_order_client_id` (`order_client_id`);
```

---

### 12.4 — Migration

`message_whatsapp/src/database/migrations/OptimisationIndexErp1778716800012.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimisationIndexErp1778716800012 implements MigrationInterface {
  name = 'OptimisationIndexErp1778716800012';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`contact\`
        ADD INDEX \`IDX_contact_order_client_id\` (\`order_client_id\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`contact\` DROP INDEX \`IDX_contact_order_client_id\``,
    );
  }
}
```

---

## Récapitulatif des fichiers à modifier

| Fichier | Phase | Type de modification |
|---------|-------|---------------------|
| `src/database/migrations/OptimisationIndexDashboard1778716800001.ts` | 1 | Nouveau fichier (migration) |
| `src/call-log/entities/call_log.entity.ts` | 1 | Ajouter `@Index` composite |
| `src/follow-up/entities/follow_up.entity.ts` | 1 | Ajouter `@Index` composite |
| `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | 1 | Ajouter `@Index` composite |
| `src/targets/targets.service.ts` | 2, 3, 4, 10 | Fusion R1+R2, cache ranking/progress, batch N+1 |
| `src/targets/targets.module.ts` | 3 | Ajouter `RedisModule` |
| `src/targets/targets-cache-invalidator.listener.ts` | 4 | Nouveau fichier (listener) |
| `src/sla/sla.service.ts` | 5 | Cache règles SLA |
| `src/sla/sla.module.ts` | 5 | Ajouter `RedisModule` |
| `src/realtime/socket-list-cache.service.ts` | 6 | TTL 2s → 15s + invalidation |
| `src/contact/contact.service.ts` | 7 | Cache contacts |
| `src/redis/redis-cache.helper.ts` | 8 | Nouveau fichier (helper) |
| `src/database/database.module.ts` | 8 | Read replica (optionnel) |
| `src/work-schedule/entities/work-schedule.entity.ts` | 9 | Ajouter `@Index` composites |
| `src/commercial-session/entities/commercial_session.entity.ts` | 9 | Ajouter `@Index` composite |
| `src/work-schedule/work-schedule.service.ts` | 9 | Paralléliser + cache Redis |
| `src/work-schedule/work-schedule.module.ts` | 9 | Ajouter `RedisModule` |
| `src/database/migrations/OptimisationIndexPlanning1778716800009.ts` | 9 | Nouveau fichier (migration) |
| `src/analytics/analytics.service.ts` | 11 | Cache ranking + summary |
| `src/analytics/analytics.module.ts` | 11 | Ajouter `RedisModule` |
| `src/whatsapp_message/entities/whatsapp_message.entity.ts` | 11 | Ajouter `@Index` self-join |
| `src/database/migrations/OptimisationIndexAnalytics1778716800011.ts` | 11 | Nouveau fichier (migration) |
| `src/integration-outbox/integration-outbox.service.ts` | 12 | `claimBatch()` pessimistic lock |
| `src/erp-client-sync/erp-client-sync.service.ts` | 12 | Batch `findOne` → `find(IN)` |
| `src/contact/entities/contact.entity.ts` | 12 | Ajouter `@Index` order_client_id |
| `src/database/migrations/OptimisationIndexErp1778716800012.ts` | 12 | Nouveau fichier (migration) |

---

## Convention de nommage des clés Redis (règle à respecter)

```
{domaine}:{entité}:{identifiant}[:{variante}]

ranking:{period}                        → today / week / month  TTL 30-120s
progress:{commercialId}                 → UUID commercial       TTL 60s
progress:all                            → global admin view     TTL 60s
sla:rules:{tenantId}                    → UUID tenant           TTL 300s
contact:{contactId}                     → UUID contact          TTL 300s
schedule:commercial:{commercialId}      → UUID commercial       TTL 300s
analytics:ranking:{from}:{to}           → plage de dates        TTL 120s
analytics:summary:{tenantId}:{from}:{to}→ plage de dates        TTL 60s
flow:def:{flowId}                       → UUID flow             TTL 600s
socket:conversations:{posteId}:*        → posteId + cursorHash  TTL 15s
config:{configKey}                      → clé système           TTL 120s  ← existant
rbac:perms:{tenant}:{commercial}        → UUIDs                 TTL 300s  ← existant
ctx:channel:{channelId}                 → UUID canal            TTL 60s   ← existant
```

---

## Ordre d'exécution recommandé

```
Jour 1 — Index SQL (sans risque, impact immédiat)
├── [ ] Migration OptimisationIndexDashboard1778716800001  (call_log, follow_up, whatsapp_chat)
├── [ ] Migration OptimisationIndexPlanning1778716800009   (work_schedule, commercial_session)
├── [ ] Migration OptimisationIndexAnalytics1778716800011  (whatsapp_message self-join)
├── [ ] Migration OptimisationIndexErp1778716800012        (contact.order_client_id)
└── [ ] Fusionner R1+R2 dans targets.service.ts (Promise.all des 4 requêtes)

Jour 2 — Fix N+1 critique (objectifs + ERP sync)
├── [ ] Implémenter computeProgressBatch() dans TargetsService
├── [ ] Wraper getProgressAll() avec computeProgressBatch()
├── [ ] Batch lookup contacts dans ErpClientSyncService.syncErpClients()
└── [ ] Fix race condition claimBatch() (pessimistic lock)

Jour 3 — Cache ranking + progress (dashboard)
├── [ ] Ajouter RedisModule dans TargetsModule
├── [ ] Injecter REDIS_CLIENT dans TargetsService
├── [ ] Wraper getRanking() avec cache + invalidateRankingCache()
├── [ ] Wraper getProgress() + getProgressAll() avec cache Redis
└── [ ] Créer TargetsCacheInvalidatorListener (message.saved, call_log.created, follow_up.completed)

Jour 4 — Cache analytics + planning
├── [ ] Cache getCommercialRanking() dans AnalyticsService (TTL 120s)
├── [ ] Cache getSummary() dans AnalyticsService (TTL 60s)
├── [ ] Ajouter RedisModule dans AnalyticsModule
├── [ ] Cache findForCommercial() dans WorkScheduleService (TTL 300s)
└── [ ] Paralléliser les 3 requêtes de findForCommercial()

Jour 5 — Cache SLA + socket
├── [ ] Cache getActiveRules() dans SlaService
└── [ ] TTL socket:conversations 2s → 15s + invalidation

Semaine suivante — Cache contacts + helper
├── [ ] Cache findById() dans ContactService
└── [ ] Créer redis-cache.helper.ts (refactoring futur)

Sprint dédié — Architecture
├── [ ] Évaluer si la charge justifie un read replica
└── [ ] Table commercial_realtime_metrics + job 5min
```

---

*Plan généré le 2026-05-14 — basé sur l'analyse de `RAPPORT_OPTIMISATION_REDIS_DASHBOARD.md`*  
*Étendu le 2026-05-14 — Phases 9-12 couvrant Planning, Objectifs, Classement et Intégration ERP*
