# Plan de correction — Requêtes SQL Vue d'Ensemble

Date : 2026-06-20  
Basé sur : `docs/RAPPORT_REQUETES_SQL_VUE_ENSEMBLE_2026-06-20.md`  
Dernier timestamp migration utilisé : `1782000000002`

---

## Ordre d'exécution

```
C1 (migrations index) → C2 (getStatutChannels refactor) → C3 (index poste_status) → C4 (endpoint stats) → C5 (thundering herd)
```

C1 doit précéder C2 car la requête optimisée dépend des index.  
C3 est indépendant. C4 et C5 sont indépendants.

---

## C1 — Migrations d'index pour `getStatutChannels` (P0)

### Contexte

`getStatutChannels` exécute 2 sous-requêtes scalaires par channel :
- `COUNT(*) FROM whatsapp_chat WHERE channel_id = X AND last_activity_at BETWEEN ...`
- `COUNT(*) FROM whatsapp_message WHERE channel_id = X AND createdAt BETWEEN ...`

**Indexes existants :**
- `whatsapp_chat` : aucun index sur `(channel_id, last_activity_at)` ❌
- `whatsapp_message` : aucun index sur `(channel_id, createdAt)` ❌

### Fichiers à créer

#### `message_whatsapp/src/database/migrations/AddChannelStatsIndexes1782086400001.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelStatsIndexes1782086400001 implements MigrationInterface {
  name = 'AddChannelStatsIndexes1782086400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Index pour getStatutChannels — COUNT chats par canal sur période
    const chatIdxExists = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsapp_chat'
        AND INDEX_NAME = 'IDX_chat_channel_activity'
    `);
    if (parseInt(chatIdxExists[0].cnt, 10) === 0) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_chat_channel_activity\`
          ON \`whatsapp_chat\` (\`channel_id\`, \`last_activity_at\`, \`deletedAt\`)
      `);
    }

    // Index pour getStatutChannels — COUNT messages par canal sur période
    const msgIdxExists = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsapp_message'
        AND INDEX_NAME = 'IDX_msg_channel_time'
    `);
    if (parseInt(msgIdxExists[0].cnt, 10) === 0) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_msg_channel_time\`
          ON \`whatsapp_message\` (\`channel_id\`, \`createdAt\`, \`deletedAt\`)
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_channel_activity\` ON \`whatsapp_chat\``);
    await queryRunner.query(`DROP INDEX \`IDX_msg_channel_time\` ON \`whatsapp_message\``);
  }
}
```

**⚠️ Note :** `CREATE INDEX` sur `whatsapp_message` (459k lignes) peut prendre 30–120s. Vérifier que `command_timeout` est suffisant dans `deploy-production.yml` (déjà à 30m ✅).

---

## C2 — Refactoring `getStatutChannels` (P0)

### Fichier : `message_whatsapp/src/metriques/metriques.service.ts`
### Méthode : `getStatutChannels()` — lignes 534–579

### Code AVANT (problématique)

```typescript
async getStatutChannels(
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<StatutChannelDto[]> {
  const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

  // ❌ Sous-requêtes scalaires : 2N requêtes pour N channels
  const channels = await this.channelRepository
    .createQueryBuilder('channel')
    .select('channel.id',           'id')
    .addSelect('channel.channel_id', 'channel_id')
    .addSelect('channel.label',      'label')
    .addSelect('channel.is_business','is_business')
    .addSelect('channel.uptime',     'uptime')
    .addSelect(
      `(SELECT COUNT(*) FROM whatsapp_chat c
         WHERE c.channel_id = channel.channel_id
           AND c.deletedAt IS NULL
           AND c.last_activity_at >= :dateStart
           AND c.last_activity_at <= :dateEnd)`,
      'nb_chats_actifs',
    )
    .addSelect(
      `(SELECT COUNT(*) FROM whatsapp_message m
         WHERE m.channel_id = channel.channel_id
           AND m.deletedAt IS NULL
           AND m.createdAt >= :dateStart
           AND m.createdAt <= :dateEnd)`,
      'nb_messages',
    )
    .setParameters({ dateStart, dateEnd })
    .orderBy('nb_messages', 'DESC')
    .getRawMany();
  // ...
}
```

### Code APRÈS (optimisé)

```typescript
async getStatutChannels(
  periode = 'today',
  dateFrom?: string,
  dateTo?: string,
): Promise<StatutChannelDto[]> {
  const { dateStart, dateEnd } = this.dateRange(periode, dateFrom, dateTo);

  // ✅ 1 seule requête : LEFT JOIN + GROUP BY remplace 2N sous-requêtes scalaires.
  // Requiert : IDX_chat_channel_activity(channel_id, last_activity_at, deletedAt)
  //            IDX_msg_channel_time(channel_id, createdAt, deletedAt)
  const channels = await this.channelRepository
    .createQueryBuilder('channel')
    .select('channel.id',            'id')
    .addSelect('channel.channel_id',  'channel_id')
    .addSelect('channel.label',       'label')
    .addSelect('channel.is_business', 'is_business')
    .addSelect('channel.uptime',      'uptime')
    .addSelect('COUNT(DISTINCT c.id)', 'nb_chats_actifs')
    .addSelect('COUNT(DISTINCT m.id)', 'nb_messages')
    .leftJoin(
      'whatsapp_chat',
      'c',
      `c.channel_id = channel.channel_id
       AND c.deletedAt IS NULL
       AND c.last_activity_at >= :dateStart
       AND c.last_activity_at <= :dateEnd`,
    )
    .leftJoin(
      'whatsapp_message',
      'm',
      `m.channel_id = channel.channel_id
       AND m.deletedAt IS NULL
       AND m.createdAt >= :dateStart
       AND m.createdAt <= :dateEnd`,
    )
    .setParameters({ dateStart, dateEnd })
    .groupBy('channel.id')
    .addGroupBy('channel.channel_id')
    .addGroupBy('channel.label')
    .addGroupBy('channel.is_business')
    .addGroupBy('channel.uptime')
    .orderBy('nb_messages', 'DESC')
    .getRawMany();

  return channels.map((ch) => ({
    id:              ch.id,
    channel_id:      ch.channel_id,
    label:           ch.label ?? null,
    is_business:     Boolean(ch.is_business),
    uptime:          parseInt(ch.uptime)           || 0,
    nb_chats_actifs: parseInt(ch.nb_chats_actifs)  || 0,
    nb_messages:     parseInt(ch.nb_messages)      || 0,
  }));
}
```

**Impact attendu :** 44 requêtes → 1 requête. Gain ~95% sur cette section.

**⚠️ Attention double LEFT JOIN :** Si un channel a beaucoup de chats ET de messages sur la période, le produit cartésien `chats × messages` peut multiplier les lignes avant le GROUP BY. Utiliser `COUNT(DISTINCT)` est obligatoire (et déjà en place dans le code APRÈS). Pour un volume extrême, une alternative avec 2 sous-requêtes groupées serait :

```sql
-- Alternative si COUNT(DISTINCT) est trop lent à très haut volume :
LEFT JOIN (
  SELECT channel_id, COUNT(*) as cnt
  FROM whatsapp_chat
  WHERE deletedAt IS NULL AND last_activity_at BETWEEN ? AND ?
  GROUP BY channel_id
) c ON c.channel_id = channel.channel_id
LEFT JOIN (
  SELECT channel_id, COUNT(*) as cnt
  FROM whatsapp_message
  WHERE deletedAt IS NULL AND createdAt BETWEEN ? AND ?
  GROUP BY channel_id
) m ON m.channel_id = channel.channel_id
```
→ 1 seule requête, pas de multiplication cartésienne. À utiliser si EXPLAIN montre un GROUP BY coûteux.

---

## C3 — Index `(poste_id, status)` sur `whatsapp_chat` (P1)

### Contexte

`getPerformanceCommerciaux` — requête R2.4 :
```sql
SELECT poste_id, COUNT(*) FROM whatsapp_chat
WHERE poste_id IN (...) AND status = 'actif' AND deletedAt IS NULL
GROUP BY poste_id
```

**Index existant :** `IDX_chat_poste_time (poste_id, createdAt, deletedAt)` — ne couvre pas `status`.  
**Index manquant :** `(poste_id, status)` pour filtrer directement.

### Fichier à créer

#### `message_whatsapp/src/database/migrations/AddPosteStatusIndex1782086400002.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosteStatusIndex1782086400002 implements MigrationInterface {
  name = 'AddPosteStatusIndex1782086400002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsapp_chat'
        AND INDEX_NAME = 'IDX_chat_poste_status'
    `);
    if (parseInt(exists[0].cnt, 10) === 0) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_chat_poste_status\`
          ON \`whatsapp_chat\` (\`poste_id\`, \`status\`, \`deletedAt\`)
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_poste_status\` ON \`whatsapp_chat\``);
  }
}
```

### Entité à mettre à jour

**Fichier :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Ajouter après les autres `@Index` :

```typescript
@Index('IDX_chat_poste_status', ['poste_id', 'status', 'deletedAt'])
```

---

## C4 — Endpoint `/api/commerciaux/:id/stats` manquant (P1)

### Contexte

`CommercialStatsService.getStats(commercialId, periode)` existe mais n'est accessible qu'en `GET /auth/me/stats` (stats du commercial connecté).  
L'admin n'a pas de route pour consulter les stats d'un commercial spécifique.

### Fichier : `message_whatsapp/src/whatsapp_commercial/whatsapp_commercial.controller.ts`

**Routes existantes :**
- `GET /` — liste
- `GET /presence`
- `GET /:id`
- `PATCH /:id`
- `DELETE /:id`
- `PATCH /:id/working-today`

**Route à ajouter :**

```typescript
import { CommercialStatsService } from './commercial-stats.service';
import { CommercialStatsDto } from './dto/commercial-stats.dto';

// Dans le constructeur :
constructor(
  private readonly whatsappCommercialService: WhatsappCommercialService,
  private readonly commercialStatsService: CommercialStatsService,  // ← ajouter
) {}

// Nouvelle route (avant @Get(':id') pour éviter le conflit de routing) :
@Get(':id/stats')
@UseGuards(AdminGuard)
async getCommercialStats(
  @Param('id') id: string,
  @Query('periode') periode: string = 'today',
  @Query('dateFrom') dateFrom?: string,
  @Query('dateTo') dateTo?: string,
): Promise<CommercialStatsDto> {
  return this.commercialStatsService.getStats(id, periode, dateFrom, dateTo);
}
```

**Module à mettre à jour :** `whatsapp_commercial.module.ts` — s'assurer que `CommercialStatsService` est dans `providers`.

---

## C5 — Thundering herd sur le recalcul snapshot (P2)

### Contexte

`AnalyticsSnapshotService.getLatest()` vérifie le TTL mais sans mutex.  
Si le snapshot expire pendant que 10 admins chargent la page, 10 recalculs parallèles se déclenchent.

**`DistributedLockService` n'est pas disponible dans ce module** (présent dans `call-obligations`, `dispatcher`, `flowbot` mais pas dans `metriques`).

### Solution : Map en mémoire (in-process lock)

**Fichier :** `message_whatsapp/src/metriques/analytics-snapshot.service.ts`

```typescript
// Ajouter dans la classe :
private readonly computingLocks = new Map<string, Promise<void>>();

async computeForPeriode(periode: string): Promise<void> {
  const lockKey = `global:${periode}`;

  // Si un recalcul est déjà en cours pour cette période, attendre le même Promise
  if (this.computingLocks.has(lockKey)) {
    return this.computingLocks.get(lockKey);
  }

  const computePromise = this._doCompute(periode).finally(() => {
    this.computingLocks.delete(lockKey);
  });

  this.computingLocks.set(lockKey, computePromise);
  return computePromise;
}

private async _doCompute(periode: string): Promise<void> {
  const [metriques, performanceCommercial, statutChannels, performanceTemporelle] =
    await Promise.all([
      this.metriquesService.getMetriquesGlobales(periode),
      this.metriquesService.getPerformanceCommerciaux(periode),
      this.metriquesService.getStatutChannels(periode),
      this.metriquesService.getPerformanceTemporelle(
        { today: 1, week: 7, month: 30, year: 365 }[periode] ?? 7,
      ),
    ]);

  const snapshot = this.snapshotRepository.create({
    scope: 'global',
    scope_id: periode,
    date_start: null,
    date_end: null,
    ttl_seconds: 720,
    data: { metriques, performanceCommercial, statutChannels, performanceTemporelle },
  });

  await this.snapshotRepository.save(snapshot);
}
```

**Mettre à jour `getLatest()` :**

```typescript
async getLatestOrCompute(scope: string, periode: string): Promise<AnalyticsSnapshot | null> {
  const snapshot = await this.getLatest(scope, periode);
  if (snapshot) return snapshot;

  // Snapshot expiré — recalcul avec lock in-process
  await this.computeForPeriode(periode);

  return this.snapshotRepository.findOne({
    where: { scope: scope as any, scope_id: periode },
    order: { computed_at: 'DESC' },
  });
}
```

**Note :** Ce lock est in-process (1 instance). Si le backend scale horizontalement, Redis lock sera nécessaire (injectable via `DistributedLockService` qui est déjà dans le projet).

---

## C6 — Self-joins R1.2 / R2.5 : vérification EXPLAIN (P2)

### Contexte

Les self-joins sur `whatsapp_message` sont potentiellement coûteux à haut volume.

**Index existant :** `IDX_msg_response_time (chat_id, direction, timestamp)` ✅

### Action requise

Exécuter sur la DB production (lecture seule) :

```sql
EXPLAIN SELECT AVG(TIMESTAMPDIFF(SECOND, msg_in.timestamp, msg_out.timestamp))
FROM whatsapp_message msg_out
INNER JOIN whatsapp_message msg_in
  ON msg_out.chat_id = msg_in.chat_id
 AND msg_in.direction  = 'IN'
 AND msg_out.direction = 'OUT'
 AND msg_in.timestamp < msg_out.timestamp
 AND msg_in.timestamp >= msg_out.timestamp - INTERVAL 1 HOUR
WHERE msg_out.deletedAt IS NULL
  AND msg_in.deletedAt IS NULL
  AND msg_out.createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)
  AND msg_out.createdAt <= NOW();
```

**Critère Go :** `type = ref` ou `eq_ref` sur `IDX_msg_response_time`, `rows` estimées < 50 000.  
**Si KO :** Ajouter index `(chat_id, direction, createdAt, timestamp)` covering.

---

## Flux de données complet après corrections

```
Admin ouvre la Vue d'Ensemble
         │
         ▼
GET /api/metriques/overview?section=*  ×4 (parallèle)
         │
         ▼
MetriquesController → AnalyticsSnapshotService.getLatestOrCompute()
         │
         ├── Snapshot valide (< 720s) → retour JSON <100ms ✅
         │
         └── Snapshot expiré → computeForPeriode() [LOCK in-process]
                    │
                    ▼
              Promise.all([
                getMetriquesGlobales()   → 9 req parallèles  ✅
                getPerformanceCommerciaux() → 5 req parallèles ✅ + index (poste_id,status)
                getStatutChannels()      → 1 req (refactorisée) ✅ + 2 index channel
                getPerformanceTemporelle() → 1 req            ✅
              ])
                    │
                    ▼
              Sauvegarde snapshot → retour ~800ms
```

---

## Checklist d'implémentation

### Avant de commencer
- [ ] Confirmer que `command_timeout: 30m` est bien dans `deploy-production.yml` (déjà fait ✅)
- [ ] Exécuter `EXPLAIN` C6 sur DB production pour valider les self-joins

### C1 — Migrations index channels
- [ ] Créer `AddChannelStatsIndexes1782086400001.ts`
- [ ] Vérifier avec `npx tsc --noEmit` (0 erreur backend)

### C2 — Refactor `getStatutChannels`
- [ ] Modifier `metriques.service.ts` lignes 534–579
- [ ] Vérifier le type de retour `StatutChannelDto[]` (propriétés inchangées)
- [ ] Tester avec `EXPLAIN` sur DB staging que le LEFT JOIN utilise `IDX_chat_channel_activity`
- [ ] `npx tsc --noEmit`

### C3 — Index poste_status
- [ ] Créer `AddPosteStatusIndex1782086400002.ts`
- [ ] Ajouter `@Index('IDX_chat_poste_status', ...)` dans `whatsapp_chat.entity.ts`
- [ ] `npx tsc --noEmit`

### C4 — Endpoint `/api/commerciaux/:id/stats`
- [ ] Ajouter handler `@Get(':id/stats')` dans `whatsapp_commercial.controller.ts`
- [ ] Vérifier que `CommercialStatsService` est dans les providers du module
- [ ] `npx tsc --noEmit`

### C5 — Thundering herd
- [ ] Modifier `analytics-snapshot.service.ts` — `computingLocks` Map + `computeForPeriode()`
- [ ] Mettre à jour `metriques.controller.ts` pour appeler `getLatestOrCompute()` au lieu de `getLatest()`
- [ ] `npx tsc --noEmit`

### Validation finale
- [ ] `cd message_whatsapp && npm test` — 0 régression
- [ ] `cd admin && npm run build` — 0 erreur
- [ ] Déployer sur staging, observer les logs pour `SNAPSHOT_COMPUTE_START`
- [ ] Vérifier dans les logs DB que `getStatutChannels` ne génère plus qu'1 requête

---

## Gains attendus

| Correction | Métrique avant | Métrique après |
|---|---|---|
| C2 — N+1 channels | 44 requêtes / refresh | 1 requête |
| C1 — Index channel | Scan 459k + 118k × 22 | Index lookup |
| C3 — Index poste_status | Scan 118k actifs | Index direct |
| C5 — Thundering herd | N recalculs simultanés | 1 recalcul partagé |
| **Total page** | ~3–5s cold start | **< 800ms cold start** |
