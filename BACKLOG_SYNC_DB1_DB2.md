# Backlog — Synchronisation DB1 ↔ DB2

**Date :** 2026-05-08  
**Source :** `PLAN_IMPLEMENTATION_RECOMMANDATIONS_DB_SYNC.md`  
**Branche cible :** `master`  
**Règle absolue :** ne jamais écrire dans les tables natives DB2

---

## Légende

| Symbole | Signification |
|---------|--------------|
| `[P0]` | Bloquant — risque de perte de données ou panne silencieuse |
| `[P1]` | Haute priorité — fiabilité |
| `[P2]` | Important — robustesse et observabilité |
| `XS` `S` `M` | Effort (XS < 1h · S < 4h · M < 1j) |
| `🔴` | Bloqué par dépendance externe (équipe DB2) |
| `🟢` | Implémentable immédiatement |
| `✅` | Livré |

---

## Tableau de bord

| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T1 | Supprimer `IntegrationListener` stub | P2 | XS | ✅ Livré |
| T2 | Créer `SCHEMA_DB2.md` | P0 | XS | ✅ Livré |
| T3 | Tests unitaires `resolveClientCategory()` | P1 | S | ✅ Livré (5/5) |
| T4 | `is_business_rejection` dans `integration_sync_log` | P1 | S | ✅ Livré |
| T5 | Fenêtre de tolérance curseur + déduplication | P2 | M | ✅ Livré |
| T6 | Création `messaging_client_dossier_mirror` en DB2 | P0 | XS | ✅ Code livré · ⏳ Ops DB2 |
| T7 | Mapper `statuts_commandes` + enrichir catégorisation | P2 | M | ✅ Livré |
| T8 | Synchronisation complète au redémarrage du backend | P1 | S | ✅ Livré |

**Progression : 8/8 tickets code livrés · Action ops restante : exécuter DDL SCHEMA_DB2.md en gicop_db**

---

## Sprint 1 — Nettoyage & documentation ✅ TERMINÉ

---

### [T1] · [P2] · Supprimer `IntegrationListener` stub · ✅ LIVRÉ
**Effort :** XS

**Contexte**  
`src/integration/integration.listener.ts` était un `@Injectable()` vide sans aucune méthode. Enregistré dans `IntegrationModule`, il polluait le registre de providers NestJS et induisait en erreur lors de la lecture du code.

**Implémentation réalisée**
- Fichier `src/integration/integration.listener.ts` supprimé
- `src/integration/integration.module.ts` : `IntegrationListener` retiré des `providers` et de l'import

**Critères d'acceptation**
- [x] Le fichier `integration.listener.ts` n'existe plus
- [x] `IntegrationModule` compile sans erreur
- [x] Aucun autre fichier ne référence `IntegrationListener`

---

### [T2] · [P0] · Créer `SCHEMA_DB2.md` · ✅ LIVRÉ
**Effort :** XS

**Contexte**  
Le DDL de `messaging_client_dossier_mirror` existait uniquement en commentaire dans `src/order-write/services/order-dossier-mirror-write.service.ts`. Sans fichier formalisé, l'équipe DB2 ne peut pas créer la table de façon traçable. Tant que la table est absente, chaque soumission de rapport commercial échoue silencieusement avec retry backoff exponentiel jusqu'à 24 h.

**Implémentation réalisée**
- Fichier `SCHEMA_DB2.md` créé à la racine du projet
- DDL complet de `messaging_client_dossier_mirror` (24 colonnes + 2 index)
- Droits requis : `SELECT`, `INSERT`, `UPDATE` uniquement (pas de `DELETE`)
- Procédure de vérification après création (requêtes de test)
- Tableau récapitulatif de toutes les colonnes

**Critères d'acceptation**
- [x] `SCHEMA_DB2.md` présent et versionné dans le repo
- [x] DDL conforme à l'entité `MessagingClientDossierMirror` (24 colonnes + 2 index)
- [ ] Transmettre à l'équipe DB2 pour exécution ← **action manuelle restante**

**Rollback**  
Sans objet — ticket documentaire.

---

## Sprint 2 — Synchronisation au redémarrage ✅ TERMINÉ

---

### [T8] · [P1] · Synchronisation complète au redémarrage du backend · ✅ LIVRÉ
**Effort :** S

**Contexte**  
`OrderCallSyncJob.onApplicationBootstrap()` n'appelait que `syncCommercialMapping()`. Si le backend redémarrait, `syncNewCalls()` n'était pas déclenché immédiatement — attente jusqu'à 5 minutes avant de rattraper les appels DB2 manqués. `OutboxProcessorService` n'avait aucun hook de démarrage.

**Implémentation réalisée**

`src/order-call-sync/order-call-sync.job.ts` :
- `onApplicationBootstrap()` : fire & forget via `setImmediate(() => this._run('bootstrap'))`
- `_run(triggeredBy: 'cron' | 'bootstrap' = 'cron')` : log `"Sync DB2 démarrée (source: bootstrap)"` + métriques à la fin

`src/gicop-report/outbox-processor.service.ts` :
- Implémente `OnApplicationBootstrap`
- `onApplicationBootstrap()` : fire & forget via `setImmediate(() => this.processOutbox())`

**Critères d'acceptation**
- [x] Au redémarrage, logs affichent `"Sync DB2 démarrée (source: bootstrap)"` dans les 2 secondes
- [x] `onApplicationBootstrap()` se termine en < 500 ms (sync non bloquante)
- [x] Les entrées `integration_outbox` pending sont traitées au redémarrage sans attendre le cron
- [x] Lock Redlock `cron:order-call-sync` protège les deux chemins (cron + bootstrap)

**Rollback**  
Retirer `setImmediate(...)` des deux `onApplicationBootstrap()`.

---

## Sprint 3 — Fiabilité des logs ✅ TERMINÉ

---

### [T4] · [P1] · Distinguer rejets métier et erreurs techniques dans `integration_sync_log` · ✅ LIVRÉ
**Effort :** S

**Contexte**  
Un appel DB2 sans tâche d'obligation correspondante générait un log `status = 'failed'`. C'est un rejet métier normal (`matched: false`), pas une erreur technique. Les deux cas étaient indiscernables dans les dashboards, provoquant de faux positifs dans les alertes.

**Implémentation réalisée**

Migration `src/database/migrations/20260508_integration_sync_log_business_rejection.ts` (classe `IntegrationSyncLogBusinessRejection1746648000001`) :
- `ALTER TABLE integration_sync_log ADD COLUMN is_business_rejection TINYINT(1) NOT NULL DEFAULT 0 AFTER last_error`
- `ADD INDEX IDX_sync_log_business (status, is_business_rejection)`

`src/integration-sync/entities/integration-sync-log.entity.ts` :
- Colonne `isBusinessRejection: boolean` ajoutée

`src/integration-sync/integration-sync-log.service.ts` :
- `markFailed(id, error, isBusinessRejection = false)` — paramètre optionnel

`src/order-call-sync/order-call-sync.service.ts` :
- Rejets métier (`matched: false`) → `markFailed(logId, reason, true)`
- Erreurs techniques (catch) → `markFailed(logId, err.message, false)` (défaut)

**Critères d'acceptation**
- [x] `npx tsc --noEmit` → 0 erreur
- [x] Migration `up()` exécutable sans erreur sur une DB existante
- [x] Rejets métier : `is_business_rejection = 1` en base
- [x] Erreurs techniques : `is_business_rejection = 0`
- [x] Monitoring peut filtrer `WHERE status = 'failed' AND is_business_rejection = 0`

**Rollback**  
`migration:revert` → supprime colonne et index. Remettre `markFailed()` à 2 paramètres.

---

### [T3] · [P1] · Tests unitaires `resolveClientCategory()` · ✅ LIVRÉ
**Effort :** S

**Contexte**  
`resolveClientCategory()` est la fonction la plus critique du pont DB1↔DB2 — elle détermine la catégorie d'obligation pour chaque appel traité. Elle n'avait aucun test unitaire dédié. Après l'ajout de la règle retour (T7), le test CAS-05 a été ajouté.

**Implémentation réalisée**

Fichier créé : `src/order-call-sync/__tests__/resolve-client-category.spec.ts`

| Cas | Scénario | Attendu |
|-----|----------|---------|
| CAS-01 | `id_client` présent + `dateLivree` définie + pas de retour | `COMMANDE_AVEC_LIVRAISON` |
| CAS-02 | Fallback téléphone + `trueCancel = 1` | `COMMANDE_ANNULEE` |
| CAS-03 | `id_client` présent, aucune commande | `JAMAIS_COMMANDE` |
| CAS-04 | `id_client` absent, numéro inconnu | `JAMAIS_COMMANDE` |
| CAS-05 | `dateLivree` définie mais dernier statut = retour (`etat 99`) | `COMMANDE_ANNULEE` |

**Critères d'acceptation**
- [x] `npx jest resolve-client-category` → **5/5 tests verts**
- [x] Aucun appel réseau ou DB réel dans les tests
- [x] Couverture des 5 branches de `resolveClientCategory()`

**Rollback**  
Supprimer le fichier de test. Aucun impact fonctionnel.

---

## Sprint 4 — Protection drift curseur ✅ TERMINÉ

---

### [T5] · [P2] · Fenêtre de tolérance curseur (lookback + déduplication) · ✅ LIVRÉ
**Effort :** M

**Contexte**  
`syncNewCalls()` lisait les appels strictement après `(call_timestamp, id)` du curseur. Les appels insérés dans DB2 avec un `call_timestamp` antérieur au curseur (lag réseau, horloge décalée) étaient définitivement perdus.

**Implémentation réalisée**

`src/order-call-sync/order-call-sync.service.ts` :
- Constante `CURSOR_LOOKBACK_MINUTES = 10`
- `lookbackSince = since - lookbackMinutes * 60_000` calculé à chaque sync
- WHERE élargi : `c.call_timestamp >= :lookbackSince` (au lieu du tie-breaker strict)
- Déduplication avant `processCall()` : `await this.syncLog.existsForEntity('call_validation', call.id)`
- Valeur configurable via `process.env['ORDER_CALL_SYNC_LOOKBACK_MINUTES']`

`src/integration-sync/integration-sync-log.service.ts` :
- `existsForEntity(entityType, entityId): Promise<boolean>` — utilise l'index `IDX_sync_log_entity`

`src/system-config/system-config.service.ts` :
- Clé `ORDER_CALL_SYNC_LOOKBACK_MINUTES` ajoutée au catalogue (catégorie `integration`, défaut `'10'`)
- Ajustable sans redéploiement via `POST /admin/system-config`

**Critères d'acceptation**
- [x] Un appel inséré dans DB2 avec un `call_timestamp` de 8 min en retard est traité au prochain cycle
- [x] Un appel déjà traité avec succès n'est pas retraité (déduplication)
- [x] `npx tsc --noEmit` → 0 erreur
- [x] Valeur de lookback modifiable via l'admin sans redémarrage

**Rollback**  
Supprimer `existsForEntity()`, retirer la constante et le lookback de la clause WHERE, supprimer la clé system-config.

---

## Sprint 5 — Enrichissement catégorisation DB2 ✅ TERMINÉ

---

### [T7] · [P2] · Mapper `statuts_commandes` + enrichir catégorisation · ✅ LIVRÉ
**Effort :** M

**Contexte**  
La table `statuts_commandes` de DB2 trackait l'historique des états de livraison de chaque commande mais n'était pas mappée. Un client dont la livraison avait été retournée (`etat 2, 4, 99`) apparaissait comme `COMMANDE_AVEC_LIVRAISON` puisque `dateLivree` était définie. Cela faussait les obligations d'appels GICOP.

**Schéma DB2 reçu le 2026-05-08**

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
)
```

**Codes `etat` connus**

| `etat` | `action` | Signification |
|--------|----------|--------------|
| 1, 3, 5 | NULL | États livreur (prise en charge, en cours, livraison) |
| 2, 4 | `retour en stock` | Retour en stock — livraison échouée |
| 99 | `retour commande` | Retour commande — client refuse |

**Implémentation réalisée**

`src/order-read/entities/order-command-status.entity.ts` (nouveau fichier) :
- Entité read-only `@Entity('statuts_commandes')` avec toutes les colonnes
- Constante `ORDER_COMMAND_STATUS_ETAT_RETOUR = [2, 4, 99]`
- Index `idx_status_cmd_lookup` sur `(idCommande, valid, dateEnreg)`

`src/order-db/order-db.module.ts` :
- `OrderCommandStatus` ajouté à la liste `entities` du DataSource DB2 (`synchronize: false`)

`src/order-call-sync/order-call-sync.service.ts` — nouvelle règle dans `resolveClientCategory()` :
```
Ordre de priorité final :
  1. DB2 indisponible             → JAMAIS_COMMANDE
  2. Aucune commande              → JAMAIS_COMMANDE
  3. trueCancel = 1               → COMMANDE_ANNULEE
  4. Dernier statut retour (2/4/99) → COMMANDE_ANNULEE  ← NOUVEAU
  5. dateLivree IS NOT NULL       → COMMANDE_AVEC_LIVRAISON
  6. Défaut                       → JAMAIS_COMMANDE
```

**Critères d'acceptation**
- [x] `npx tsc --noEmit` → 0 erreur
- [x] `OrderCommandStatus` accessible depuis DB2 (lecture seule via `orderDb.getRepository`)
- [x] `resolveClientCategory()` retourne `COMMANDE_ANNULEE` si dernier statut = retour
- [x] CAS-05 dans `resolve-client-category.spec.ts` → vert

**Rollback**  
Supprimer l'entité, retirer de `order-db.module.ts`, retirer la règle T7 de `resolveClientCategory()`.

---

## Sprint 6 — Synchronisation DB2 ✅ CODE TERMINÉ

---

### [T6] · [P0] · Création `messaging_client_dossier_mirror` côté DB2 · ✅ CODE LIVRÉ
**Effort :** XS · **Dépend de :** T2 ✅

**Contexte**  
La table `messaging_client_dossier_mirror` doit être créée dans DB2 (`gicop_db`) par l'équipe ERP/DB2. Toute l'implémentation code est terminée — entité, service, outbox, migration DB1, monitoring.

**Implémentation code réalisée**

`src/order-write/entities/messaging-client-dossier-mirror.entity.ts` :
- Entité TypeORM complète (24 colonnes, 2 index `IDX_mirror_id_client` / `IDX_mirror_id_commercial`)

`src/order-write/services/order-dossier-mirror-write.service.ts` :
- `upsertDossier(payload)` — upsert idempotent sur DB2 via `ORDER_DB_DATA_SOURCE`
- `markClosure(messagingChatId, result, closedAt)` — marque fermeture en DB2
- Résolution automatique `commercialIdDb1 → idCommercial` et `contactIdDb1 → idClient` via mappings

`src/integration-outbox/` :
- `IntegrationOutboxService` — queue avec backoff exponentiel (2^attempt × 60s, max 24h)
- `enqueue()`, `claimBatch()`, `markSuccess()`, `markFailed()`, `getStats()`, `requeueEntry()`

`src/gicop-report/outbox-processor.service.ts` :
- Cron minutier + `OnApplicationBootstrap` fire & forget
- Traite 20 entrées par lot, met à jour `ConversationReport.submissionStatus`

`src/gicop-report/outbox-alert.service.ts` :
- Vérification toutes les 5 min : alerte si pending > 10 min ou failed ≥ 5

`src/database/migrations/20260425_messaging_client_dossier_mirror.ts` :
- Migration DB1 idempotente (`hasTable` guard)

**Action ops restante (équipe DB2)**
- [ ] Exécuter le DDL de `SCHEMA_DB2.md` dans `gicop_db`
- [ ] Accorder `GRANT SELECT, INSERT, UPDATE` à l'utilisateur applicatif
- [ ] Valider : `SELECT COUNT(*) FROM messaging_client_dossier_mirror` → 0 rows, no error

**Critères de validation en staging**
- [ ] Soumettre un rapport test → `integration_outbox.status = 'success'` dans la minute
- [ ] `ConversationReport.submissionStatus = 'sent'`
- [ ] Ligne présente dans `messaging_client_dossier_mirror` côté DB2
- [ ] `OutboxAlertService` : aucune alerte `failed` en continu

**Rollback**  
Sans objet — création de table idempotente (`IF NOT EXISTS`). Si la table est supprimée, les retries reprennent automatiquement via l'outbox.

---

## Résumé par sprint

### Sprint 1 — Nettoyage & documentation ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T1 | Supprimer `IntegrationListener` stub | P2 | XS | ✅ |
| T2 | Créer `SCHEMA_DB2.md` | P0 | XS | ✅ |

### Sprint 2 — Synchronisation au redémarrage ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T8 | Sync complète au redémarrage (fire & forget) | P1 | S | ✅ |

### Sprint 3 — Fiabilité des logs ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T4 | `is_business_rejection` dans `integration_sync_log` | P1 | S | ✅ |
| T3 | Tests unitaires `resolveClientCategory()` | P1 | S | ✅ (5/5) |

### Sprint 4 — Protection drift curseur ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T5 | Fenêtre de tolérance curseur + déduplication | P2 | M | ✅ |

### Sprint 5 — Enrichissement catégorisation DB2 ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T7 | Mapper `statuts_commandes` + règle retour | P2 | M | ✅ |

### Sprint 6 — Synchronisation DB2 ✅
| Ticket | Titre | Priorité | Effort | Statut |
|--------|-------|----------|--------|--------|
| T6 | Création `messaging_client_dossier_mirror` en DB2 | P0 | XS | ✅ Code · ⏳ DDL DB2 |

---

## Checklist finale

```
[✅] T1  IntegrationListener supprimé — module nettoyé
[✅] T2  SCHEMA_DB2.md créé (24 colonnes, DDL + droits + procédure de test)
[✅] T3  5/5 tests resolveClientCategory (CAS-01 à CAS-05)
[✅] T4  is_business_rejection — migration prête, markFailed() mis à jour
[✅] T5  Lookback 10 min actif, deduplication existsForEntity()
[✅] T6  Code complet : entité + upsertDossier() + outbox + monitoring + migration DB1
        ⏳  Ops restant : exécuter SCHEMA_DB2.md dans gicop_db + GRANT à l'utilisateur applicatif
[✅] T7  statuts_commandes mappé — règle retour (etat 2/4/99) dans resolveClientCategory
[✅] T8  Bootstrap fire & forget — OrderCallSyncJob + OutboxProcessor
```

---

*Backlog mis à jour le 2026-05-08 · 8/8 tickets code livrés · Action ops restante : DDL en gicop_db (SCHEMA_DB2.md)*
