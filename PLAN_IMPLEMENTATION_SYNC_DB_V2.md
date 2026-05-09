# Plan d'Implémentation — Raffinage Sync DB1 ↔ DB2 · V2

**Date** : 2026-05-09  
**Source** : `RAPPORT_SYNC_DB1_DB2.md` (audit complet 2026-05-09)  
**Prérequis** : `PLAN_IMPLEMENTATION_RECOMMANDATIONS_DB_SYNC.md` V1 — 6/8 tickets livrés  
**Règle absolue** : ne jamais écrire dans les tables natives DB2

---

## Légende

| Symbole | Signification |
|---------|---------------|
| `[P0]` | Bloquant — perte de données ou panne silencieuse |
| `[P1]` | Haute priorité — fiabilité et exactitude |
| `[P2]` | Important — robustesse et observabilité |
| `XS` `S` `M` `L` | Effort (XS < 1h · S < 4h · M < 1j · L < 3j) |
| ✅ | Livré | ⏳ | À faire | 🔴 | Bloqué externe |

---

## État hérité du V1

| Ticket V1 | Statut |
|-----------|--------|
| T1 — Supprimer `IntegrationListener` | ✅ |
| T3 — Tests `resolveClientCategory` (5/5) | ✅ |
| T4 — `is_business_rejection` dans sync_log | ✅ |
| T5 — Lookback curseur 10 min + déduplication | ✅ |
| T7 — Entité `OrderCommandStatus` + règle retour | ✅ (confirmé par `statuts_commandes.sql`) |
| T8 — Sync au démarrage (fire & forget) | ✅ |
| T2 — `SCHEMA_DB2.md` | ⏳ |
| T6 — Table miroir en DB2 | 🔴 Bloqué équipe DB2 |

---

## Vue d'ensemble V2

| ID | Titre | Lacune | Prio | Effort | Sprint |
|----|-------|--------|------|--------|--------|
| N1 | Timeouts DB2 | L-001 | P0 | XS | 1 |
| N2 | Centraliser normalisation phone | L-002 | P0 | S | 1 |
| N3 | Guard `ORDER_DB_AVAILABLE` avant upsert | L-005 | P0 | XS | 1 |
| N4 | Synchroniser `client_category` depuis DB2 | L-006 | P1 | M | 2 |
| N5 | File d'attente appels non résolus | L-007 | P1 | M | 2 |
| N6 | Cron nettoyage mapping orphelins | L-008 | P1 | S | 2 |
| N7 | Tests intégration DB2 fixture locale | L-013 | P1 | L | 2 |
| N8 | Seuil qualité batch (% au lieu de 100%) | L-004 | P2 | M | 3 |
| N9 | Cron `purgeOldSuccess` hebdomadaire | L-010 | P2 | XS | 3 |
| N10 | Alerting escalade batch bloqué | L-011 | P2 | S | 3 |
| N11 | Refresh mapping commercial si phone change | L-012 | P2 | S | 3 |
| N12 | `BATCH_SIZE` dynamique via env | L-015 | P2 | XS | 4 |
| N13 | Recalcul device counts via QueryBuilder | L-014 | P2 | S | 4 |
| N14 | Contrainte unique composite `call_event` | Design | P2 | S | 4 |

---

## Sprint 1 — Garde-fous critiques (P0)

> Objectif : éliminer les risques de panne silencieuse et de perte de données.

---

### N1 · [P0] · Timeouts DB2 · XS

**Problème** : Le pool MySQL DB2 est configuré sans `queryTimeout`. Si DB2 répond lentement ou hang, les 5 connexions du pool sont saturées indéfiniment, bloquant toute la sync.

**Fichier** : `src/order-db/order-db.module.ts`

**Implémentation** :
```typescript
// Dans createDataSource() — options TypeORM extra
extra: {
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 50,
  enableKeepAlive: true,
  keepAliveInitialDelay: 30_000,
  connectTimeout: 10_000,   // ← NOUVEAU : timeout connexion 10s
},
// Après la clé `extra`
connectTimeoutMS: 10_000,   // ← NOUVEAU : timeout TypeORM niveau driver
```

**Variables d'env optionnelles à ajouter** :
```
ORDER_DB_CONNECT_TIMEOUT_MS=10000
ORDER_DB_QUERY_TIMEOUT_MS=15000
```

**Vérification** : couper DB2 en dev, démarrer le backend → log `"[OrderDb] Connexion DB2 indisponible"` doit apparaître en moins de 11s, `ORDER_DB_AVAILABLE` = false.

---

### N2 · [P0] · Centraliser normalisation phone · S

**Problème** : La normalisation téléphone est dupliquée en plusieurs endroits avec des règles légèrement différentes (`0700...` vs `+225...` vs `225...`). Un numéro mal normalisé → résolution silencieusement ratée → catégorie `JAMAIS_COMMANDE` par défaut.

**Fichier à créer** : `src/shared/utils/normalize-phone.ts`

**Implémentation** :
```typescript
/**
 * Normalise un numéro de téléphone vers sa forme locale courte (chiffres uniquement, sans indicatif).
 * Exemples :
 *   "+2250700000001" → "0700000001"
 *   "2250700000001"  → "0700000001"
 *   "0700000001"     → "0700000001"
 *   " +225 07 00 000001 " → "0700000001"
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Retirer indicatif +225 (Côte d'Ivoire) si présent
  if (digits.startsWith('225') && digits.length === 13) {
    return digits.slice(3); // "2250700000001" → "0700000001"
  }
  return digits;
}

/** Retourne true si deux numéros normalisés correspondent. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length > 0 && na === nb;
}
```

**Fichiers à migrer** (remplacer les normalisations inline) :
- `src/order-call-sync/order-call-sync.service.ts` — `syncCommercialMapping()`, `syncClientMapping()`, `resolveClientCategory()`
- `src/order-db/order-db.repository.ts` — `findClientByPhone()`, `findMissedCallsSince()`
- `src/call-obligations/call-obligation.service.ts` — résolution par phone

**Test à ajouter** : `src/shared/utils/__tests__/normalize-phone.spec.ts` (couvrir indicatif présent, absent, espaces, null).

**Vérification** : `npx tsc --noEmit` → 0 erreur · tests normalize-phone verts.

---

### N3 · [P0] · Guard `ORDER_DB_AVAILABLE` avant upsert · XS

**Problème** : `OrderDossierMirrorWriteService.upsertDossier()` lance directement une requête DB2 sans vérifier `ORDER_DB_AVAILABLE`. Si DB2 est down, le throw se propage, marque l'entrée outbox `failed` et déclenche le backoff — au lieu d'un skip propre avec log.

**Fichier** : `src/order-write/services/order-dossier-mirror-write.service.ts`

**Implémentation** :
```typescript
async upsertDossier(payload: DossierMirrorPayload): Promise<void> {
  if (!this.orderDbAvailable) {
    this.logger.warn('[DossierMirror] DB2 indisponible — upsert ignoré', {
      chatId: payload.messagingChatId,
    });
    return; // skip propre, pas de throw
  }
  // ... reste de la logique existante
}
```

**Injection à vérifier** : `@Inject(ORDER_DB_AVAILABLE) private readonly orderDbAvailable: boolean` déjà injecté ? Sinon ajouter au constructeur.

**Vérification** : simuler DB2 down → outbox doit rester en `pending` (pas de `failed`), log warn visible.

---

## Sprint 2 — Fiabilité du flux appels (P1)

> Objectif : garantir qu'aucun appel éligible n'est perdu définitivement.

---

### N4 · [P1] · Synchroniser `client_category` depuis DB2 · M

**Problème** : `Contact.client_category` en DB1 est rempli manuellement ou via des règles internes qui peuvent diverger de la réalité DB2. Si un client a une commande annulée en DB2 mais `client_category = 'sans_commande'` en DB1, l'obligation sera mal catégorisée.

**Approche** : ajouter une méthode `syncClientCategories()` dans `OrderCallSyncService` appelée en cron (1×/jour) et au bootstrap.

**Fichier** : `src/order-call-sync/order-call-sync.service.ts`

**Logique** :
```
Pour chaque Contact DB1 ayant un client_identity_mapping (external_id DB2 connu) :
  1. Résoudre catégorie réelle via DB2 (resolveClientCategory par external_id)
  2. Si catégorie DB2 ≠ Contact.client_category → UPDATE Contact.client_category
  3. Logger les contacts mis à jour
```

**Cron à ajouter** dans `order-call-sync.job.ts` :
```typescript
@Cron('0 2 * * *') // 2h du matin, 1× par jour
async syncClientCategories(): Promise<void> {
  // Lock distribué cron:sync-client-categories TTL 3600s
}
```

**Impact attendu** : `Contact.client_category` devient fiable → `tryMatchCallToTask()` peut se fier au fallback DB1 quand DB2 est temporairement indisponible.

**Vérification** : créer un contact avec `client_category = 'jamais_commande'`, lui ajouter une commande annulée en DB2 fixture, déclencher `syncClientCategories()` → catégorie corrigée.

---

### N5 · [P1] · File appels non résolus · M

**Problème** : un appel DB2 arrivant sans `localNumber` reconnu ET sans `deviceId` dans `call_device` est ingéré dans `call_event` mais ne peut jamais être matché à une obligation (ni `commercial_id` ni `device_id` rempli). Il échoue définitivement dans `retryUnmatchedObligations()`.

**Approche** : créer une table `call_event_unresolved` (DB1) pour les appels en attente de résolution manuelle.

**Migration** à créer : `src/database/migrations/CallEventUnresolved<timestamp>.ts`

```sql
CREATE TABLE call_event_unresolved (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  external_id   VARCHAR(100) NOT NULL UNIQUE,
  local_number  VARCHAR(30),
  remote_number VARCHAR(30),
  device_id     VARCHAR(100),
  call_type     VARCHAR(20),
  duration_sec  INT,
  event_at      DATETIME     NOT NULL,
  reason        VARCHAR(200),            -- pourquoi non résolu
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME     DEFAULT NULL,
  KEY idx_unresolved_event_at (event_at),
  KEY idx_unresolved_resolved (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Modifications** dans `order-call-sync.service.ts` :
- Si résolution commercial échoue → INSERT INTO `call_event_unresolved` avec `reason = 'commercial_not_found'`
- Ne pas marquer `failed` dans `integration_sync_log` pour ces cas (c'est un `pending` métier)

**Endpoint admin** dans `order-sync-admin.controller.ts` :
```
GET  /admin/order-sync/unresolved         — liste (50 derniers)
POST /admin/order-sync/unresolved/:id/retry — force une nouvelle tentative
```

**Vérification** : envoyer un appel DB2 avec un numéro inconnu → apparaît dans `/admin/order-sync/unresolved`.

---

### N6 · [P1] · Cron nettoyage mapping orphelins · S

**Problème** : quand un `Contact` ou `WhatsappCommercial` est supprimé en DB1, la ligne dans `client_identity_mapping` / `commercial_identity_mapping` reste, pouvant provoquer des confusions lors des lookups.

**Fichier** : `src/order-call-sync/order-call-sync.service.ts`

**Méthode à ajouter** :
```typescript
async cleanOrphanMappings(): Promise<{ clients: number; commercials: number }> {
  // DELETE FROM client_identity_mapping
  // WHERE contact_id NOT IN (SELECT id FROM contact)
  const clients = await this.db
    .createQueryBuilder()
    .delete()
    .from(ClientIdentityMapping)
    .where('contact_id NOT IN (SELECT id FROM contact)')
    .execute();

  // DELETE FROM commercial_identity_mapping
  // WHERE commercial_id NOT IN (SELECT id FROM whatsapp_commercial)
  const commercials = await this.db
    .createQueryBuilder()
    .delete()
    .from(CommercialIdentityMapping)
    .where('commercial_id NOT IN (SELECT id FROM whatsapp_commercial)')
    .execute();

  return { clients: clients.affected ?? 0, commercials: commercials.affected ?? 0 };
}
```

**Cron** dans `order-call-sync.job.ts` :
```typescript
@Cron('0 3 * * 0') // Dimanche à 3h
async cleanOrphans(): Promise<void> { ... }
```

**Endpoint admin** :
```
POST /admin/order-sync/clean-orphans — déclenchement manuel
```

---

### N7 · [P1] · Tests intégration DB2 fixture locale · L

**Problème** : aucun test ne couvre les interactions réelles avec DB2. Un changement de schéma DB2 passerait inaperçu jusqu'en production.

**Approche** : utiliser un conteneur MariaDB en test (Jest `globalSetup`) avec les tables DB2 en fixture.

**Fichiers à créer** :

`test/fixtures/db2-schema.sql` — DDL des 4 tables DB2 lues :
```sql
-- call_logs, commandes, users, statuts_commandes
-- (schémas reçus de l'équipe DB2)
```

`test/setup/db2-test-datasource.ts` — DataSource de test pointant vers le conteneur :
```typescript
export const db2TestDataSource = new DataSource({
  type: 'mysql',
  host: process.env['TEST_ORDER_DB_HOST'] ?? 'localhost',
  port: 3307, // port distinct du DB1 de test
  ...
  entities: [OrderCommand, OrderCallLog, GicopUser, OrderCommandStatus],
  synchronize: false,
});
```

**Tests à écrire** :
- `order-db.repository.spec.ts` — `findCallLogsAfterCursor`, `findClientByPhone`, `findDormantClients`
- `order-call-sync.service.integration.spec.ts` — cycle complet `syncNewCalls()` avec fixture de 5 appels

**Configuration** `jest.config.ts` :
```typescript
projects: [
  { displayName: 'unit', testPathPattern: '(?<!integration)\\.spec\\.ts$' },
  { displayName: 'integration', testPathPattern: '\\.integration\\.spec\\.ts$',
    globalSetup: '<rootDir>/test/setup/db2-container.ts' },
]
```

---

## Sprint 3 — Observabilité et qualité (P2)

---

### N8 · [P2] · Seuil qualité batch configurable · M

**Problème** : `qualityCheckPassed` est `false` dès qu'une seule conversation active n'a pas la réponse du commercial en dernier. Trop strict en pratique (conversation dormante = KO complet).

**Fichier** : `src/call-obligations/call-obligation.service.ts`

**Implémentation** :

1. Ajouter une clé `CALL_QUALITY_THRESHOLD_PCT` dans `SystemConfigService` (défaut : `80`)

2. Modifier `checkAndRecordQuality()` :
```typescript
const threshold = await this.systemConfig.getNumber('CALL_QUALITY_THRESHOLD_PCT', 80);
const okCount = activeConvs.filter(
  c => c.lastPosteMessageAt >= c.lastClientMessageAt
).length;
const pct = activeConvs.length > 0
  ? Math.round((okCount / activeConvs.length) * 100)
  : 100;

batch.qualityCheckPassed = pct >= threshold;
batch.qualityCheckDetails = `${okCount}/${activeConvs.length} (${pct}% ≥ ${threshold}%)`;
```

3. Ajouter colonne `quality_check_details` (VARCHAR 100) dans `commercial_obligation_batch` :

**Migration** : `CommercialObligationBatchQualityDetails<timestamp>.ts`
```sql
ALTER TABLE commercial_obligation_batch
  ADD COLUMN quality_check_details VARCHAR(100) DEFAULT NULL AFTER quality_check_passed;
```

**Vérification** : poste avec 4/5 conversations répondues → `qualityCheckPassed = true` si threshold = 80%.

---

### N9 · [P2] · Cron `purgeOldSuccess` hebdomadaire · XS

**Problème** : `IntegrationSyncLogService.purgeOldSuccess()` existe mais n'est jamais appelée automatiquement → la table `integration_sync_log` grossit sans limite.

**Fichier** : ajouter dans `order-call-sync.job.ts` (ou créer `integration-sync-log.job.ts`)

```typescript
@Cron('0 4 * * 0') // Dimanche à 4h
async purgeOldSyncLogs(): Promise<void> {
  const deleted = await this.syncLog.purgeOldSuccess(30); // 30 jours
  this.logger.log(`[SyncLog] Purge : ${deleted} entrées success supprimées (> 30j)`);
}
```

**Endpoint admin** (optionnel) :
```
POST /admin/order-sync/purge-logs?days=30
```

---

### N10 · [P2] · Alerting escalade batch bloqué · S

**Problème** : si un batch reste en `status = 'pending'` avec `qualityCheckPassed = false` pendant plusieurs jours, aucun manager n'est notifié.

**Approche** : étendre `ObligationQualityCheckJob` pour détecter les batches bloqués.

**Fichier** : `src/call-obligations/obligation-quality-check.job.ts`

**Logique à ajouter** :
```typescript
// Après le quality check normal
const stuckBatches = await this.batchRepo.find({
  where: {
    status: BatchStatus.PENDING,
    qualityCheckPassed: false,
    updatedAt: LessThan(subDays(new Date(), STUCK_BATCH_ALERT_DAYS)),
  },
});

for (const batch of stuckBatches) {
  await this.notificationService.alertManager({
    type: 'BATCH_STUCK',
    posteId: batch.posteId,
    batchNumber: batch.batchNumber,
    message: `Batch #${batch.batchNumber} bloqué depuis > ${STUCK_BATCH_ALERT_DAYS}j (qualité KO)`,
  });
}
```

**Constante** `STUCK_BATCH_ALERT_DAYS = 3` (configurable via `SystemConfigService`).

**Vérification** : créer un batch avec `qualityCheckPassed = false` et `updatedAt` vieux de 4 jours → alerte déclenchée.

---

### N11 · [P2] · Refresh mapping commercial si phone change · S

**Problème** : `syncCommercialMapping()` fait un `INSERT IGNORE` — si un commercial change de numéro, son ancien numéro reste dans `commercial_identity_mapping` et le nouveau n'est pas pris en compte.

**Fichier** : `src/order-call-sync/order-call-sync.service.ts` — méthode `syncCommercialMapping()`

**Implémentation** : remplacer `INSERT IGNORE` par un vrai UPSERT :
```typescript
await this.db
  .createQueryBuilder()
  .insert()
  .into(CommercialIdentityMapping)
  .values({ commercialId, externalId, commercialName })
  .orUpdate(
    ['commercial_name'],          // champs à mettre à jour si conflit
    ['commercial_id'],            // clé de conflit
  )
  .execute();
```

> Ne pas mettre à jour `external_id` si déjà mappé — un changement d'external_id suggère un problème de données qui nécessite une intervention manuelle.

**Log** à ajouter : si `external_id` DB2 change pour un même `commercial_id` → `logger.warn('[CommercialMapping] Changement external_id détecté')` + skip.

---

## Sprint 4 — Qualité code et performance (P2)

---

### N12 · [P2] · `BATCH_SIZE` dynamique via env · XS

**Fichier** : `src/order-call-sync/order-call-sync.service.ts`

**Implémentation** :
```typescript
private readonly batchSize: number = parseInt(
  process.env['ORDER_CALL_SYNC_BATCH_SIZE'] ?? '200',
  10,
);
```

Remplacer la constante `BATCH_SIZE = 200` inline par `this.batchSize`.

**Documenter dans `.env.example`** :
```
ORDER_CALL_SYNC_BATCH_SIZE=200    # Appels lus par cycle (défaut 200)
ORDER_CALL_SYNC_LOOKBACK_MINUTES=10  # Fenêtre de rattrapage (défaut 10)
```

---

### N13 · [P2] · Recalcul device counts via QueryBuilder · S

**Problème** : le recalcul des `device_count` dans `order-call-sync.service.ts` utilise du SQL raw non typesafe.

**Fichier** : `src/order-call-sync/order-call-sync.service.ts`

**Remplacement** :
```typescript
// Avant (SQL raw)
const results = await this.orderDb.query(
  `SELECT device_id, COUNT(*) as cnt FROM call_logs GROUP BY device_id`
);

// Après (QueryBuilder typé)
const results = await this.orderDb
  .getRepository(OrderCallLog)
  .createQueryBuilder('c')
  .select('c.deviceId', 'deviceId')
  .addSelect('COUNT(*)', 'cnt')
  .where('c.deviceId IS NOT NULL')
  .groupBy('c.deviceId')
  .getRawMany<{ deviceId: string; cnt: string }>();
```

---

### N14 · [P2] · Contrainte unique composite `call_event` · S

**Problème** : `call_event` a un index `UQ_call_event_external_id` sur `external_id`, mais si `external_id` est `NULL` (cas théorique), deux appels identiques pourraient être insérés.

**Migration** à créer : `CallEventUniqueComposite<timestamp>.ts`
```sql
ALTER TABLE call_event
  ADD UNIQUE INDEX UQ_call_event_device_ts (
    device_id,
    client_phone,
    event_at
  );
```

> Index partiel (ignoré si device_id NULL) — ne casse pas les appels sans device.

---

## Checklist de validation V2

```
Sprint 1 — Garde-fous critiques
[ ] N1 — Timeout connectTimeoutMS=10s ajouté dans OrderDbModule
[ ] N2 — normalizePhone() centralisé, tous les appels migrés, tests verts
[ ] N3 — Guard ORDER_DB_AVAILABLE dans upsertDossier, log warn si skip

Sprint 2 — Fiabilité flux appels
[ ] N4 — syncClientCategories() cron 2h/jour, Contact.client_category synchronisé
[ ] N5 — Table call_event_unresolved créée, migration présente, endpoint admin OK
[ ] N6 — cleanOrphanMappings() cron dimanche 3h, endpoint manuel /clean-orphans
[ ] N7 — Tests intégration DB2 sur fixture locale, CI vert (integration suite)

Sprint 3 — Observabilité
[ ] N8 — Seuil qualité configurable CALL_QUALITY_THRESHOLD_PCT (défaut 80%)
[ ] N9 — purgeOldSyncLogs() cron dimanche 4h
[ ] N10 — Alerte batch bloqué > 3 jours, notificationService.alertManager()
[ ] N11 — syncCommercialMapping() UPSERT (maj commercial_name), warn si external_id change

Sprint 4 — Qualité code
[ ] N12 — ORDER_CALL_SYNC_BATCH_SIZE env var + .env.example mis à jour
[ ] N13 — Recalcul device counts via QueryBuilder typé
[ ] N14 — Index unique composite call_event (device_id, client_phone, event_at)

Hérité V1
[ ] T2 — SCHEMA_DB2.md créé et transmis à l'équipe DB2
[ ] T6 — Table messaging_client_dossier_mirror créée en DB2 (dépend équipe DB2)
```

---

## Dépendances et ordre d'exécution

```
N1 (timeout)        ─── indépendant ──────────────────── Sprint 1
N2 (phone util)     ─── indépendant ──────────────────── Sprint 1
N3 (guard upsert)   ─── indépendant ──────────────────── Sprint 1
                              │
                    ┌─────────┴──────────┐
                    │                    │
N4 (sync catégorie) │             N5 (unresolved queue)   Sprint 2
   dépend N2        │                dépend N2
N6 (orphans)        │
N7 (tests)          ─── dépend N1,N2 ────────────────── Sprint 2
                              │
                    ┌─────────┴──────────┐
N8 (seuil qualité)  │             N10 (alerting batch)   Sprint 3
N9 (purge logs)     │             N11 (refresh mapping)
                              │
N12, N13, N14       ─── indépendants ─────────────────── Sprint 4
```

---

## Variables d'environnement à documenter

| Variable | Défaut | Description |
|----------|--------|-------------|
| `ORDER_DB_HOST` | — | Hôte MySQL DB2 (obligatoire) |
| `ORDER_DB_PORT` | 3306 | Port MySQL DB2 |
| `ORDER_DB_USER` | — | Utilisateur DB2 |
| `ORDER_DB_PASSWORD` | — | Mot de passe DB2 |
| `ORDER_DB_NAME` | — | Nom base DB2 |
| `ORDER_DB_CONNECT_TIMEOUT_MS` | 10000 | Timeout connexion DB2 (N1) |
| `ORDER_CALL_SYNC_LOOKBACK_MINUTES` | 10 | Fenêtre rattrapage curseur (T5 V1) |
| `ORDER_CALL_SYNC_BATCH_SIZE` | 200 | Appels lus par cycle (N12) |
| `CALL_QUALITY_THRESHOLD_PCT` | 80 | Seuil qualité batch en % (N8) |
| `STUCK_BATCH_ALERT_DAYS` | 3 | Jours avant alerte batch bloqué (N10) |

---

*Plan V2 créé le 2026-05-09 · Basé sur l'audit complet `RAPPORT_SYNC_DB1_DB2.md` · Schéma `statuts_commandes` confirmé par `statuts_commandes.sql` reçu le 2026-05-08*
