# Plan d'implémentation — Recommandations Sync DB1 ↔ DB2

**Date :** 2026-05-08  
**Source :** `RAPPORT_SYNC_DB1_DB2.md`  
**Branche cible :** `master`  
**Règle absolue :** ne jamais écrire dans les tables natives DB2

---

## Légende

| Symbole | Signification |
|---------|--------------|
| `[P0]` | Bloquant — risque de perte de données ou de panne silencieuse |
| `[P1]` | Haute priorité — qualité et fiabilité |
| `[P2]` | Important — robustesse et observabilité |
| `[P3]` | Valeur ajoutée — préventif |
| `XS` `S` `M` `L` | Effort (XS < 1h · S < 4h · M < 1j · L < 3j) |
| `🔴` | Bloqué par une dépendance externe (équipe DB2) |
| `🟢` | Implémentable immédiatement |

---

## Vue d'ensemble

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T1 | Supprimer `IntegrationListener` | P2 | XS | 🟢 |
| T2 | Créer `SCHEMA_DB2.md` | P0 | XS | 🟢 |
| T3 | Tests `resolveClientCategory()` | P1 | S | 🟢 |
| T4 | Champ `is_business_rejection` dans `integration_sync_log` | P1 | S | 🟢 |
| T5 | Protection drift curseur (fenêtre de tolérance) | P2 | M | 🟢 |
| **T8** | **Synchronisation complète au redémarrage du backend** | **P1** | **S** | 🟢 |
| T6 | Création `messaging_client_dossier_mirror` côté DB2 | P0 | XS | 🔴 |
| T7 | Mapper `statuts_commandes` | P2 | M | 🔴 |

**Ordre recommandé :**
```
T2 → T6 (ops DB2)               ← dépendance externe à déclencher immédiatement
T1 → T8 → T4 → T3 → T5         ← implémentation code indépendante
T7                               ← après confirmation schéma DB2
```

---

## Sprint 1 — Nettoyage et documentation (< 1 journée)

### T1 · [P2] · Supprimer `IntegrationListener` · XS · 🟢

**Problème :** `src/integration/integration.listener.ts` est un stub `@Injectable()` vide. Il est enregistré comme provider dans `IntegrationModule` mais ne fait rien.

**Fichiers à modifier :**

**`src/integration/integration.listener.ts`** — supprimer le fichier entièrement.

**`src/integration/integration.module.ts`** — retirer `IntegrationListener` des `providers` :
```typescript
// Avant
providers: [IntegrationService, IntegrationListener],

// Après
providers: [IntegrationService],
```
Retirer aussi l'import de `IntegrationListener`.

**Vérification :** `npx tsc --noEmit` → 0 erreur.

---

### T2 · [P0] · Créer `SCHEMA_DB2.md` · XS · 🟢

**Problème :** le DDL de `messaging_client_dossier_mirror` existe uniquement dans un commentaire de service. L'équipe DB2 ne peut pas l'appliquer de façon traçable.

**Fichier à créer :** `SCHEMA_DB2.md` à la racine du projet.

**Contenu :**
```markdown
# Schéma DB2 — Tables créées par la plateforme messagerie

## messaging_client_dossier_mirror

Table créée et maintenue par la plateforme messagerie dans la base DB2 (ORDER_DB).
Contient le miroir des dossiers clients issus des rapports de conversation.

**Statut :** À créer manuellement par l'équipe DB2.

### DDL

\```sql
CREATE TABLE IF NOT EXISTS messaging_client_dossier_mirror (
  messaging_chat_id        VARCHAR(100) NOT NULL,
  id_client                INT          DEFAULT NULL,
  id_commercial            INT          DEFAULT NULL,
  client_messaging_contact VARCHAR(200) DEFAULT NULL,
  client_phones            TEXT         DEFAULT NULL,
  client_name              VARCHAR(200) DEFAULT NULL,
  commercial_name          VARCHAR(200) DEFAULT NULL,
  commercial_phone         VARCHAR(30)  DEFAULT NULL,
  commercial_email         VARCHAR(200) DEFAULT NULL,
  ville                    VARCHAR(100) DEFAULT NULL,
  commune                  VARCHAR(100) DEFAULT NULL,
  quartier                 VARCHAR(100) DEFAULT NULL,
  product_category         VARCHAR(200) DEFAULT NULL,
  client_need              TEXT         DEFAULT NULL,
  interest_score           TINYINT      DEFAULT NULL,
  next_action              VARCHAR(50)  DEFAULT NULL,
  follow_up_at             DATETIME     DEFAULT NULL,
  notes                    TEXT         DEFAULT NULL,
  conversation_result      VARCHAR(50)  DEFAULT NULL,
  closed_at                DATETIME     DEFAULT NULL,
  sync_status              ENUM('pending','synced','error') DEFAULT 'pending',
  sync_error               TEXT         DEFAULT NULL,
  submitted_at             DATETIME     DEFAULT NULL,
  updated_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (messaging_chat_id),
  KEY IDX_mirror_id_client     (id_client),
  KEY IDX_mirror_id_commercial (id_commercial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
\```

### Droits requis

La plateforme messagerie a besoin des droits suivants sur cette table :
- `SELECT`, `INSERT`, `UPDATE` — lecture/écriture dossiers
- Pas de `DELETE` — les données sont archivées, jamais supprimées
```

**Action opérationnelle :** transmettre ce fichier à l'équipe DB2 pour exécution. Tant que la table est absente, chaque soumission de rapport échouera silencieusement avec backoff exponentiel dans `integration_outbox`.

---

## Sprint 2 — Synchronisation au redémarrage + fiabilité logs (< 1 journée)

### T8 · [P1] · Synchronisation complète au redémarrage du backend · S · 🟢

**Problème actuel :** `OrderCallSyncJob.onApplicationBootstrap()` appelle uniquement `syncCommercialMapping()`. Si le backend redémarre (déploiement, crash, scaling), `syncNewCalls()` n'est pas déclenché immédiatement — le backend attend le prochain tick cron (jusqu'à 5 min) avant de rattraper les appels DB2 manqués pendant l'arrêt.

De même, l'`OutboxProcessorService` n'a aucun hook de démarrage : les entrées `integration_outbox` en attente ne sont traitées qu'au prochain tick cron (1 min), ce qui peut retarder la première synchronisation DB1 → DB2 après un redémarrage.

**Comportement voulu :** à chaque redémarrage du backend, les deux flux de sync démarrent immédiatement de façon asynchrone, sans bloquer le démarrage de l'application.

---

#### Étape 1 — `OrderCallSyncJob` : ajouter `syncNewCalls()` au bootstrap

**Fichier :** `src/order-call-sync/order-call-sync.job.ts`

```typescript
// Avant
async onApplicationBootstrap(): Promise<void> {
  try {
    await this.syncService.syncCommercialMapping();
  } catch (err) {
    this.logger.error(`Erreur sync mapping au démarrage: ${(err as Error).message}`);
  }
}
```

```typescript
// Après
async onApplicationBootstrap(): Promise<void> {
  // Mapping commercial synchrone (rapide, bloquant intentionnellement)
  try {
    await this.syncService.syncCommercialMapping();
  } catch (err) {
    this.logger.error(`Erreur sync mapping au démarrage: ${(err as Error).message}`);
  }

  // Rattrapage des appels DB2 manqués pendant l'arrêt — fire & forget
  // Ne bloque pas le démarrage de l'application
  setImmediate(() => {
    this._run().catch((err) =>
      this.logger.error(`Erreur sync appels au démarrage: ${(err as Error).message}`),
    );
  });
}
```

**Pourquoi `setImmediate` ?**
- Laisse NestJS finir l'initialisation des autres modules avant de démarrer la sync
- Évite de bloquer `onApplicationBootstrap()` des autres services
- Le lock distribué (`tryWithLock`) protège contre les doubles exécutions en multi-instance : si deux pods redémarrent simultanément, un seul acquiert le lock et synchonise, l'autre log `LOCK_SKIPPED`

**Cas multi-instance :** le Redlock `cron:order-call-sync` (TTL 450 000 ms) garantit qu'un seul pod exécute `_run()` à la fois, que ce soit via le bootstrap ou le cron. Aucune double synchronisation.

---

#### Étape 2 — `OutboxProcessorService` : traiter l'outbox au démarrage

**Fichier :** `src/gicop-report/outbox-processor.service.ts`

Implémenter `OnApplicationBootstrap` :

```typescript
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class OutboxProcessorService implements OnApplicationBootstrap {

  async onApplicationBootstrap(): Promise<void> {
    // Traitement des entrées outbox en attente au démarrage — fire & forget
    setImmediate(() => {
      this.processNextBatch().catch((err) =>
        this.logger.error(`Erreur outbox au démarrage: ${(err as Error).message}`),
      );
    });
  }

  // ... reste du service inchangé
}
```

> `processNextBatch()` est la méthode privée déjà appelée par le cron `EVERY_MINUTE`. Elle contient déjà le flag `this.processing = true` qui protège contre les doubles exécutions.

---

#### Étape 3 — Log de démarrage explicite

Dans `_run()` de `OrderCallSyncJob`, distinguer le premier appel (bootstrap) du cron normal en loggant différemment — utile pour le monitoring :

```typescript
private async _run(triggeredBy: 'cron' | 'bootstrap' = 'cron'): Promise<void> {
  this.running = true;
  this.logger.log(`Sync DB2 démarrée (source: ${triggeredBy})`);
  try {
    await this.syncService.syncCommercialMapping();
    const result = await this.syncService.syncNewCalls();
    this.logger.log(
      `Sync DB2 terminée (source: ${triggeredBy}) — ${result.processed} appels, ${result.obligations} obligations, ${result.errors} erreurs`,
    );
  } catch (err) {
    this.logger.error(`Erreur sync DB2 (source: ${triggeredBy}): ${(err as Error).message}`);
  } finally {
    this.running = false;
  }
}
```

Appel depuis bootstrap : `this._run('bootstrap')`  
Appel depuis cron : `this._run('cron')` (inchangé dans `run()`)

---

#### Étape 4 — Test unitaire bootstrap

Ajouter dans `src/order-call-sync/__tests__/order-call-sync.service.spec.ts` (ou un nouveau fichier) :

```typescript
it('BOOT-01: déclenche syncNewCalls() au bootstrap sans bloquer', async () => {
  const syncSpy = jest.spyOn(syncService, 'syncNewCalls').mockResolvedValue({ processed: 0, obligations: 0, errors: 0 });
  await job.onApplicationBootstrap();
  // setImmediate est asynchrone — attendre qu'il s'exécute
  await new Promise(resolve => setImmediate(resolve));
  expect(syncSpy).toHaveBeenCalledTimes(1);
});

it('BOOT-02: un seul appel syncNewCalls si deux instances bootstrappent simultanément (lock)', async () => {
  // Simuler lock acquis par instance A → instance B doit recevoir LOCK_SKIPPED
  // Vérifier que syncNewCalls n'est appelé qu'une fois au total
});
```

**Vérification :** `npx tsc --noEmit` → 0 erreur.

---


### T4 · [P1] · Champ `is_business_rejection` dans `integration_sync_log` · S · 🟢

**Problème :** un appel `call_logs` sans tâche d'obligation correspondante génère un log `failed` dans `integration_sync_log`. Ce n'est pas une erreur technique — c'est un rejet métier normal. Les deux cas sont indiscernables dans les dashboards.

**Exemples de rejets métier (normal) :**
- `matched: false` — aucune tâche d'obligation active pour ce commercial
- catégorie client `JAMAIS_COMMANDE` — appel hors-périmètre obligations

**Exemples d'erreurs techniques (anomalie) :**
- timeout DB2
- exception dans `resolveClientCategory()`
- `tryMatchCallToTask()` lève une exception

#### Étape 1 — Migration

**Fichier à créer :** `src/database/migrations/20260508_integration_sync_log_business_rejection.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegrationSyncLogBusinessRejection20260508 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE integration_sync_log
        ADD COLUMN is_business_rejection TINYINT(1) NOT NULL DEFAULT 0
          COMMENT '1 = rejet metier normal (pas derreur technique)'
          AFTER last_error,
        ADD INDEX IDX_sync_log_business (status, is_business_rejection)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE integration_sync_log
        DROP INDEX IDX_sync_log_business,
        DROP COLUMN is_business_rejection
    `);
  }
}
```

> **Note :** le nom de classe doit se terminer par un timestamp JS 13 chiffres selon les conventions du projet. Utiliser `IntegrationSyncLogBusinessRejection1746648000001`.

#### Étape 2 — Entité

**Fichier :** `src/integration-sync/entities/integration-sync-log.entity.ts`

Ajouter la colonne après `lastError` :
```typescript
@Column({ name: 'is_business_rejection', type: 'tinyint', width: 1, default: 0 })
isBusinessRejection: boolean;
```

#### Étape 3 — Service

**Fichier :** `src/integration-sync/integration-sync-log.service.ts`

Modifier la signature de `markFailed()` pour accepter un flag optionnel :
```typescript
async markFailed(id: string, error: string, isBusinessRejection = false): Promise<void> {
  await this.repo.update(id, {
    status: 'failed',
    lastError: error.slice(0, 2000),
    isBusinessRejection,
    attemptCount: () => 'attempt_count + 1',
  });
}
```

#### Étape 4 — Sites d'appel

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

Dans `matchObligation()`, quand `result.matched === false`, appeler :
```typescript
await this.syncLog.markFailed(logId, result.reason ?? 'no_match', true); // isBusinessRejection = true
```

Quand une exception est catchée dans `syncNewCalls()`, appeler :
```typescript
await this.syncLog.markFailed(logId, err.message, false); // erreur technique
```

**Vérification :** `npx tsc --noEmit` → 0 erreur.

---

## Sprint 3 — Tests et qualité (< 1 journée)

### T3 · [P1] · Tests `resolveClientCategory()` · S · 🟢

**Problème :** `resolveClientCategory()` est la fonction la plus critique du pont DB1↔DB2. Elle détermine la catégorie d'obligation pour chaque appel. Elle n'a actuellement aucun test unitaire dédié.

**Fichier existant :** `src/order-call-sync/__tests__/order-call-sync.service.spec.ts` (contient OBL-024 sur le curseur).

**Fichier à créer :** `src/order-call-sync/__tests__/resolve-client-category.spec.ts`

**4 cas obligatoires à couvrir :**

```typescript
describe('OrderCallSyncService.resolveClientCategory', () => {

  // Cas 1 — Résolution directe par id_client (chemin optimal)
  it('CAS-01: retourne COMMANDE_AVEC_LIVRAISON si dateLivree IS NOT NULL', async () => {
    // call.idClient = 42
    // DB2 commandes: [{ idClient: 42, trueCancel: 0, dateLivree: new Date() }]
    // → attend ClientCategory.COMMANDE_AVEC_LIVRAISON
  });

  // Cas 2 — Résolution par numéro de téléphone (fallback)
  it('CAS-02: retourne COMMANDE_ANNULEE si trueCancel=1 (résolution par phone)', async () => {
    // call.idClient = null, call.remoteNumber = '33612345678'
    // DB2 users: [{ id: 99, type: 0, phone: '33612345678' }]
    // DB2 commandes: [{ idClient: 99, trueCancel: 1, dateLivree: null }]
    // → attend ClientCategory.COMMANDE_ANNULEE
  });

  // Cas 3 — Aucune commande
  it('CAS-03: retourne JAMAIS_COMMANDE si aucune commande pour ce client', async () => {
    // call.idClient = 55
    // DB2 commandes: [] (aucune)
    // → attend ClientCategory.JAMAIS_COMMANDE
  });

  // Cas 4 — Numéro inconnu (fallback impossible)
  it('CAS-04: retourne JAMAIS_COMMANDE si remoteNumber inconnu dans users', async () => {
    // call.idClient = null, call.remoteNumber = '33600000000'
    // DB2 users: [] (pas de match)
    // → attend ClientCategory.JAMAIS_COMMANDE
  });
});
```

**Pattern de mock à suivre :** même pattern que `makeOrderDb()` dans `order-call-sync.service.spec.ts` — pas de vraie connexion DB.

---

## Sprint 4 — Protection drift curseur (1 journée)

### T5 · [P2] · Fenêtre de tolérance curseur · M · 🟢

**Problème :** `OrderCallSyncService.syncNewCalls()` lit les appels strictement après `(call_timestamp, id)` du curseur. Si DB2 insère des appels avec un `call_timestamp` antérieur au curseur (insertions tardives, lag réseau, horloge décalée), ces appels sont définitivement perdus.

**Solution :** introduire une fenêtre de tolérance — lire depuis `curseur - LOOKBACK_WINDOW` au lieu du curseur exact, et déduplifier via `integration_sync_log`.

#### Étape 1 — Constante

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

Ajouter en tête de fichier :
```typescript
/** Fenêtre de tolérance pour les insertions tardives DB2 (en minutes). */
const CURSOR_LOOKBACK_MINUTES = 10;
```

#### Étape 2 — Modifier `syncNewCalls()`

Dans la clause WHERE de la requête DB2, remplacer :
```sql
-- Avant (strictement après le curseur)
WHERE (c.call_timestamp > :since OR (c.call_timestamp = :since AND c.id > :lastId))
```
Par :
```sql
-- Après (avec lookback)
WHERE c.call_timestamp >= :lookbackSince
  AND (c.call_timestamp > :since OR (c.call_timestamp = :since AND c.id > :lastId)
    OR c.call_timestamp < :since)
```

Puis en logique applicative, avant `processCall()`, vérifier si l'appel a déjà été traité :
```typescript
// Déduplication : ignorer les appels déjà présents dans integration_sync_log
const alreadyProcessed = await this.syncLogService.existsForEntity(
  'call_validation', call.id.toString()
);
if (alreadyProcessed) continue;
```

#### Étape 3 — Méthode `existsForEntity()` dans `IntegrationSyncLogService`

```typescript
async existsForEntity(entityType: string, entityId: string): Promise<boolean> {
  const count = await this.repo.count({
    where: { entityType: entityType as any, entityId, status: 'success' },
  });
  return count > 0;
}
```

> **Note :** l'index `IDX_sync_log_entity (entity_type, entity_id)` déjà présent rend cette requête performante.

#### Étape 4 — Paramètre configurable

Exposer `CURSOR_LOOKBACK_MINUTES` via `SystemConfigService` (clé `ORDER_CALL_SYNC_LOOKBACK_MINUTES`, défaut `10`) pour pouvoir l'ajuster sans redéploiement.

**Vérification :** `npx tsc --noEmit` → 0 erreur.

---

## Sprint 5 — Dépendances DB2 (bloqué)

### T6 · [P0] · Création `messaging_client_dossier_mirror` côté DB2 · XS · 🔴

**Action :** transmettre `SCHEMA_DB2.md` (créé en T2) à l'équipe DB2 avec le DDL complet.

**Impact si non fait :** chaque soumission de rapport commercial échoue silencieusement. L'outbox accumule des entrées en statut `failed` avec backoff exponentiel (max 24 h). Aucun dossier n'est synchronisé vers DB2.

**Vérification après création :** déclencher manuellement `OutboxProcessorService` sur une entrée test et vérifier que `submission_status` passe de `pending` à `sent`.

---

### T7 · [P2] · Mapper `statuts_commandes` · M · 🔴

**Bloqué par :** obtenir le schéma réel de la table `statuts_commandes` auprès de l'équipe DB2.

**Ce qui sera implémenté une fois débloqué :**

#### Étape 1 — Entité read-only

**Fichier à créer :** `src/order-read/entities/order-command-status.entity.ts`

```typescript
@Entity({ name: 'statuts_commandes', database: 'ORDER_DB' })
export class OrderCommandStatus {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_commande' })
  idCommande: number;

  @Column({ name: 'statut_code', nullable: true })
  statutCode: string | null;

  @Column({ name: 'statut_label', nullable: true })
  statutLabel: string | null;

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt: Date | null;

  // Ajouter les colonnes réelles après confirmation du schéma DB2
}
```

#### Étape 2 — Enregistrer dans `OrderReadModule`

```typescript
TypeOrmModule.forFeature([OrderCallLog, OrderCommand, GicocpUser, OrderCommandStatus], ORDER_DB_DATA_SOURCE)
```

#### Étape 3 — Enrichir `resolveClientCategory()`

Ajouter une 5e règle de catégorisation basée sur `statuts_commandes` (ex : commande en livraison partielle, retour, litige) — à définir avec le métier une fois le schéma connu.

#### Étape 4 — Enrichir `OrderSegmentationReadService`

Nouveaux segments possibles basés sur les statuts : `en_cours_livraison`, `litige`, `retour_marchandise`.

---

## Checklist de validation finale

```
[ ] T1 — IntegrationListener supprimé, module à jour, 0 erreur TS
[ ] T2 — SCHEMA_DB2.md créé et transmis à l'équipe DB2
[ ] T3 — 4 tests resolveClientCategory passent au vert
[ ] T4 — Colonne is_business_rejection présente, migration exécutée, markFailed() mis à jour
[ ] T5 — CURSOR_LOOKBACK_MINUTES=10 actif, déduplication via existsForEntity()
[ ] T8 — syncNewCalls() déclenché au bootstrap (fire & forget), OutboxProcessor bootstrap ajouté
[ ] T8 — Tests BOOT-01 et BOOT-02 passent au vert
[ ] T8 — Log "Sync DB2 démarrée (source: bootstrap)" visible dans les logs au redémarrage
[ ] T6 — Table messaging_client_dossier_mirror créée en DB2, OutboxProcessorService valide
[ ] T7 — Entité OrderCommandStatus créée (après schéma DB2 confirmé)
```

---

## Dépendances et ordre critique

```
Jour 1 matin   → T1 (XS) + T2 (XS)   ← démarrer T6 (ops DB2) en parallèle
Jour 1 après   → T8 (S)               ← sync au redémarrage
Jour 2 matin   → T4 (S) + T3 (S)
Jour 2 après   → T5 (M)
Dès schéma DB2 → T7 (M)
Dès table DB2  → Valider T6
```

---

*Plan généré le 2026-05-08 · Source : RAPPORT_SYNC_DB1_DB2.md*
