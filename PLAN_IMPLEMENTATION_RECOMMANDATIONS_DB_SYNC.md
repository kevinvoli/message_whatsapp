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
| `✅` | Livré |

---

## Vue d'ensemble

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T1 | Supprimer `IntegrationListener` | P2 | XS | ✅ Livré |
| T2 | Créer `SCHEMA_DB2.md` | P0 | XS | 🟢 À faire |
| T3 | Tests `resolveClientCategory()` | P1 | S | ✅ Livré (5/5 tests) |
| T4 | Champ `is_business_rejection` dans `integration_sync_log` | P1 | S | ✅ Livré |
| T5 | Protection drift curseur (fenêtre de tolérance) | P2 | M | ✅ Livré |
| T8 | Synchronisation complète au redémarrage du backend | P1 | S | ✅ Livré |
| T6 | Création `messaging_client_dossier_mirror` côté DB2 | P0 | XS | 🔴 Bloqué équipe DB2 |
| T7 | Mapper `statuts_commandes` + enrichir catégorisation | P2 | M | ✅ Livré |

**Récapitulatif :** 6/8 tickets livrés · T2 à faire · T6 bloqué équipe DB2

---

## Sprint 1 — Nettoyage et documentation ✅

### T1 · [P2] · Supprimer `IntegrationListener` · XS · ✅ LIVRÉ

**Problème :** `src/integration/integration.listener.ts` était un stub `@Injectable()` vide enregistré dans `IntegrationModule` sans aucune logique.

**Implémentation réalisée :**
- Fichier `src/integration/integration.listener.ts` supprimé
- `src/integration/integration.module.ts` : `IntegrationListener` retiré des `providers` et de l'import

**Vérification :** `npx tsc --noEmit` → 0 erreur (hors erreurs pré-existantes du spec curseur)

---

### T2 · [P0] · Créer `SCHEMA_DB2.md` · XS · 🟢 À FAIRE

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

- `SELECT`, `INSERT`, `UPDATE` — lecture/écriture dossiers
- Pas de `DELETE` — les données sont archivées, jamais supprimées
```

**Action opérationnelle :** transmettre ce fichier à l'équipe DB2 pour exécution. Tant que la table est absente, chaque soumission de rapport échouera avec backoff exponentiel dans `integration_outbox`.

---

## Sprint 2 — Synchronisation au redémarrage ✅

### T8 · [P1] · Synchronisation complète au redémarrage · S · ✅ LIVRÉ

**Implémentation réalisée :**

**`src/order-call-sync/order-call-sync.job.ts`** :
- `onApplicationBootstrap()` : après `syncCommercialMapping()`, fire & forget via `setImmediate(() => this._run('bootstrap'))`
- `_run(triggeredBy: 'cron' | 'bootstrap' = 'cron')` : log `"Sync DB2 démarrée (source: bootstrap)"` + métriques à la fin

**`src/gicop-report/outbox-processor.service.ts`** :
- Implémente `OnApplicationBootstrap`
- `onApplicationBootstrap()` : fire & forget via `setImmediate(() => this.processOutbox())`

**Garanties multi-instance :** le Redlock `cron:order-call-sync` (TTL 450 s) protège contre les doubles exécutions — un seul pod synchonise au bootstrap, les autres loggent `LOCK_SKIPPED`.

---

## Sprint 3 — Fiabilité des logs ✅

### T4 · [P1] · Champ `is_business_rejection` dans `integration_sync_log` · S · ✅ LIVRÉ

**Implémentation réalisée :**

**Migration** `src/database/migrations/20260508_integration_sync_log_business_rejection.ts` (classe `IntegrationSyncLogBusinessRejection1746648000001`) :
- `ALTER TABLE integration_sync_log ADD COLUMN is_business_rejection TINYINT(1) NOT NULL DEFAULT 0 AFTER last_error`
- `ADD INDEX IDX_sync_log_business (status, is_business_rejection)`

**`src/integration-sync/entities/integration-sync-log.entity.ts`** :
```typescript
@Column({ name: 'is_business_rejection', type: 'tinyint', width: 1, default: 0 })
isBusinessRejection: boolean;
```

**`src/integration-sync/integration-sync-log.service.ts`** :
```typescript
async markFailed(id: string, error: string, isBusinessRejection = false): Promise<void>
```

**`src/order-call-sync/order-call-sync.service.ts`** :
- Rejet métier (`matched: false`) → `markFailed(logId, reason, true)`
- Erreur technique (catch) → `markFailed(logId, err.message, false)` (défaut)

**Monitoring :** `WHERE status = 'failed' AND is_business_rejection = 0` pour les vraies alertes.

---

### T3 · [P1] · Tests `resolveClientCategory()` · S · ✅ LIVRÉ

**Fichier créé :** `src/order-call-sync/__tests__/resolve-client-category.spec.ts`

**5 cas couverts** (4 initiaux + CAS-05 ajouté après implémentation T7) :

| Cas | Scénario | Résultat attendu |
|-----|----------|-----------------|
| CAS-01 | `id_client` présent + `dateLivree` définie + pas de retour | `COMMANDE_AVEC_LIVRAISON` |
| CAS-02 | Fallback téléphone + `trueCancel = 1` | `COMMANDE_ANNULEE` |
| CAS-03 | `id_client` présent, aucune commande | `JAMAIS_COMMANDE` |
| CAS-04 | `id_client` absent, numéro inconnu | `JAMAIS_COMMANDE` |
| CAS-05 | `dateLivree` définie mais dernier statut = retour (`etat 99`) | `COMMANDE_ANNULEE` |

**Résultat :** `npx jest resolve-client-category` → **5/5 tests verts**

---

## Sprint 4 — Protection drift curseur ✅

### T5 · [P2] · Fenêtre de tolérance curseur · M · ✅ LIVRÉ

**Implémentation réalisée :**

**`src/order-call-sync/order-call-sync.service.ts`** :
- Constante `CURSOR_LOOKBACK_MINUTES = 10`
- Lecture via `process.env['ORDER_CALL_SYNC_LOOKBACK_MINUTES']` (patchée par `SystemConfigService` au boot)
- WHERE élargi : `c.call_timestamp >= :lookbackSince` (rattrape les insertions tardives DB2)
- Déduplication : `await this.syncLog.existsForEntity('call_validation', call.id)` — skip si déjà synchronisé avec succès

**`src/integration-sync/integration-sync-log.service.ts`** :
```typescript
async existsForEntity(entityType: SyncEntityType, entityId: string): Promise<boolean>
// Utilise l'index IDX_sync_log_entity (entity_type, entity_id) — O(log n)
```

**`src/system-config/system-config.service.ts`** :
- Clé `ORDER_CALL_SYNC_LOOKBACK_MINUTES` ajoutée au catalogue (catégorie `integration`, défaut `'10'`)
- Ajustable sans redéploiement via `POST /admin/system-config`

---

## Sprint 5 — Enrichissement catégorisation DB2 ✅

### T7 · [P2] · Mapper `statuts_commandes` + enrichir catégorisation · M · ✅ LIVRÉ

**Débloqué le 2026-05-08** — schéma `statuts_commandes` fourni par l'équipe DB2.

#### Schéma DB2 reçu

```sql
CREATE TABLE `statuts_commandes` (
  `id`          int(11)      NOT NULL AUTO_INCREMENT,
  `id_commande` int(11)      NOT NULL,
  `type_user`   varchar(20)  DEFAULT 'livreur',
  `id_user`     int(11)      DEFAULT NULL,
  `etat`        int(11)      NOT NULL,
  `action`      varchar(100) DEFAULT NULL,
  `date_enreg`  datetime     NOT NULL,
  `statut`      tinyint(1)   NOT NULL DEFAULT 1,
  `valid`       tinyint(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `id_user` (`id_commande`),
  KEY `acc_table_statut` (`id_commande`,`etat`,`date_enreg`,`statut`,`valid`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
```

#### Codes `etat` connus (SELECT GROUP BY etat)

| `etat` | `type_user` | `action` | Signification |
|--------|-------------|----------|--------------|
| 1 | livreur | NULL | Prise en charge livreur |
| 2 | admin | retour en stock | Retour en stock |
| 3 | livreur | NULL | En cours de livraison |
| 4 | admin | retour en stock | Retour en stock (variante) |
| 5 | livreur | NULL | Livraison en cours (étape suivante) |
| 99 | admin | retour commande | Retour commande (client refuse) |

**Codes retour :** `[2, 4, 99]` → livraison annulée après sortie de stock

#### Implémentation réalisée

**`src/order-read/entities/order-command-status.entity.ts`** (nouveau fichier) :
```typescript
export const ORDER_COMMAND_STATUS_ETAT_RETOUR: number[] = [2, 4, 99];

@Entity('statuts_commandes')
@Index('idx_status_cmd_lookup', ['idCommande', 'valid', 'dateEnreg'])
export class OrderCommandStatus {
  id: number;
  idCommande: number;
  typeUser: string | null;
  idUser: number | null;
  etat: number;             // code état livraison
  action: string | null;
  dateEnreg: Date;
  statut: number;
  valid: number;
}
```

**`src/order-db/order-db.module.ts`** :
- `OrderCommandStatus` ajouté à la liste `entities` du DataSource DB2 (`synchronize: false`)

**`src/order-call-sync/order-call-sync.service.ts`** — `resolveClientCategory()` enrichie :

Nouvelle règle insérée entre `trueCancel` et `dateLivree` :
```typescript
// T7 — Vérifier si le dernier statut de livraison indique un retour (etat 2, 4, 99)
const statusRepo = this.orderDb.getRepository(OrderCommandStatus);
const latestStatus = await statusRepo
  .createQueryBuilder('s')
  .where('s.idCommande = :orderId', { orderId: order.id })
  .andWhere('s.valid = 1')
  .orderBy('s.dateEnreg', 'DESC')
  .limit(1)
  .select(['s.etat'])
  .getOne();

if (latestStatus && ORDER_COMMAND_STATUS_ETAT_RETOUR.includes(latestStatus.etat)) {
  return CallTaskCategory.COMMANDE_ANNULEE;
}
```

#### Ordre de priorité final de `resolveClientCategory()`

```
1. orderDb indisponible           → JAMAIS_COMMANDE
2. Aucune commande pour ce client  → JAMAIS_COMMANDE
3. trueCancel = 1                  → COMMANDE_ANNULEE
4. Dernier statut retour (2/4/99)  → COMMANDE_ANNULEE  ← NOUVEAU (T7)
5. dateLivree IS NOT NULL          → COMMANDE_AVEC_LIVRAISON
6. Défaut                          → JAMAIS_COMMANDE
```

**Vérification :** `npx tsc --noEmit` → 0 erreur · **5/5 tests verts** (CAS-05 couvre la règle T7)

---

## Sprint 6 — Dépendances DB2 (bloqué)

### T6 · [P0] · Création `messaging_client_dossier_mirror` côté DB2 · XS · 🔴 BLOQUÉ

**Action :** transmettre `SCHEMA_DB2.md` (à créer via T2) à l'équipe DB2 avec le DDL complet.

**Impact si non fait :** chaque soumission de rapport commercial échoue silencieusement. L'outbox accumule des entrées `failed` avec backoff exponentiel (max 24 h). Aucun dossier n'est synchronisé vers DB2.

**Vérification après création :** déclencher manuellement `OutboxProcessorService` sur une entrée test → vérifier que `submission_status` passe de `pending` à `sent`.

---

## Checklist de validation finale

```
[✅] T1 — IntegrationListener supprimé, module à jour, 0 erreur TS
[ ] T2 — SCHEMA_DB2.md créé et transmis à l'équipe DB2
[✅] T3 — 5 tests resolveClientCategory passent au vert (5/5)
[✅] T4 — Colonne is_business_rejection présente, migration prête, markFailed() mis à jour
[✅] T5 — CURSOR_LOOKBACK_MINUTES=10 actif, déduplication via existsForEntity()
[✅] T8 — syncNewCalls() déclenché au bootstrap (fire & forget)
[✅] T8 — OutboxProcessor bootstrap ajouté
[✅] T8 — Log "Sync DB2 démarrée (source: bootstrap)" visible au redémarrage
[ ] T6 — Table messaging_client_dossier_mirror créée en DB2, OutboxProcessorService valide
[✅] T7 — Entité OrderCommandStatus créée, règle retour (etat 2/4/99) active
```

---

## Dépendances et état final

```
✅ T1  Nettoyage IntegrationListener
✅ T8  Sync au redémarrage (fire & forget)
✅ T4  is_business_rejection (rejets métier vs erreurs techniques)
✅ T3  Tests resolveClientCategory (5/5)
✅ T5  Fenêtre de tolérance curseur + déduplication
✅ T7  statuts_commandes mappé + règle retour dans resolveClientCategory
─────────────────────────────────────────────────────────
⏳ T2  SCHEMA_DB2.md (documentaire — à rédiger et transmettre)
🔴 T6  messaging_client_dossier_mirror (bloqué équipe DB2 — dépend de T2)
```

---

*Plan mis à jour le 2026-05-08 · Schéma statuts_commandes reçu le 2026-05-08*
