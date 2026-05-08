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

---

## Sprint 1 — Nettoyage & documentation (Jour 1 matin)

---

### [T1] · [P2] · Supprimer `IntegrationListener` stub
**Sprint :** 1 · **Estimation :** XS · 🟢

**Contexte**  
`src/integration/integration.listener.ts` est un `@Injectable()` vide sans aucune méthode. Il est enregistré dans `IntegrationModule` mais ne fait rien. Il pollue le registre de providers NestJS et induit en erreur lors de la lecture du code.

**Points d'implémentation**
- [ ] Supprimer le fichier `src/integration/integration.listener.ts`
- [ ] Dans `src/integration/integration.module.ts` : retirer `IntegrationListener` de `providers` et supprimer son import
- [ ] Vérifier `npx tsc --noEmit` → 0 erreur

**Critères d'acceptation**
- Le fichier `integration.listener.ts` n'existe plus
- `IntegrationModule` compile sans erreur
- Aucun autre fichier ne référence `IntegrationListener`

**Rollback**  
Recréer le fichier stub vide et le réinscrire dans le module. Aucun impact fonctionnel.

---

### [T2] · [P0] · Créer `SCHEMA_DB2.md` et transmettre à l'équipe DB2
**Sprint :** 1 · **Estimation :** XS · 🟢

**Contexte**  
Le DDL de `messaging_client_dossier_mirror` existe uniquement en commentaire dans `src/order-write/services/order-dossier-mirror-write.service.ts`. Sans ce fichier formalisé, l'équipe DB2 ne peut pas créer la table de façon traçable. Tant que la table est absente, **chaque soumission de rapport commercial échoue silencieusement** avec retry backoff exponentiel jusqu'à 24 h.

**Points d'implémentation**
- [ ] Créer `SCHEMA_DB2.md` à la racine du projet avec le DDL complet de `messaging_client_dossier_mirror`
- [ ] Inclure les droits requis : `SELECT`, `INSERT`, `UPDATE` uniquement (pas de `DELETE`)
- [ ] Transmettre le fichier à l'équipe DB2 pour exécution
- [ ] Documenter la procédure de vérification après création (requête de test)

**Critères d'acceptation**
- `SCHEMA_DB2.md` présent et versionné dans le repo
- DDL conforme à l'entité `MessagingClientDossierMirror` (25 colonnes + 2 index)
- L'équipe DB2 a accusé réception

**Rollback**  
Sans objet — ticket documentaire.

---

## Sprint 2 — Synchronisation au redémarrage (Jour 1 après-midi)

---

### [T8] · [P1] · Synchronisation complète au redémarrage du backend
**Sprint :** 2 · **Estimation :** S · 🟢

**Contexte**  
`OrderCallSyncJob.onApplicationBootstrap()` n'appelle que `syncCommercialMapping()`. Si le backend redémarre (déploiement, crash, scaling), `syncNewCalls()` n'est pas déclenché immédiatement — le backend attend jusqu'à 5 minutes avant de rattraper les appels DB2 manqués pendant l'arrêt.

`OutboxProcessorService` n'a aucun hook de démarrage : les entrées `integration_outbox` en attente ne sont traitées qu'au prochain tick cron (1 min).

**Points d'implémentation**

`src/order-call-sync/order-call-sync.job.ts` :
- [ ] Dans `onApplicationBootstrap()`, ajouter après `syncCommercialMapping()` un appel fire & forget via `setImmediate` vers `_run('bootstrap')`
- [ ] Modifier la signature de `_run()` pour accepter `triggeredBy: 'cron' | 'bootstrap' = 'cron'`
- [ ] Logger `"Sync DB2 démarrée (source: bootstrap)"` et `"Sync DB2 terminée (source: bootstrap) — X appels, Y obligations, Z erreurs"` pour traçabilité
- [ ] Vérifier que le lock Redlock `cron:order-call-sync` protège bien les deux chemins (cron + bootstrap) contre les doubles exécutions en multi-instance

`src/gicop-report/outbox-processor.service.ts` :
- [ ] Implémenter `OnApplicationBootstrap`
- [ ] Dans `onApplicationBootstrap()`, déclencher `processNextBatch()` via `setImmediate` (fire & forget)
- [ ] Le flag `this.processing = true` déjà présent protège contre les doubles exécutions

Tests :
- [ ] `BOOT-01` : vérifier que `syncNewCalls()` est appelé au bootstrap sans bloquer `onApplicationBootstrap()`
- [ ] `BOOT-02` : vérifier qu'en multi-instance, un seul pod exécute la sync (lock acquis / LOCK_SKIPPED)

**Critères d'acceptation**
- Au redémarrage, les logs affichent `"Sync DB2 démarrée (source: bootstrap)"` dans les 2 secondes
- Si deux pods redémarrent simultanément, un seul log `bootstrap` actif, l'autre log `LOCK_SKIPPED`
- `onApplicationBootstrap()` se termine en < 500 ms (sync non bloquante)
- Les entrées `integration_outbox` pending sont traitées au redémarrage sans attendre le cron

**Rollback**  
Retirer `setImmediate(...)` des deux `onApplicationBootstrap()`. Les crons reprennent comme source unique de déclenchement.

---

## Sprint 3 — Fiabilité des logs (Jour 2 matin)

---

### [T4] · [P1] · Distinguer rejets métier et erreurs techniques dans `integration_sync_log`
**Sprint :** 3 · **Estimation :** S · 🟢

**Contexte**  
Un appel DB2 sans tâche d'obligation correspondante génère un log `status = 'failed'` dans `integration_sync_log`. C'est un rejet métier normal (`matched: false`), pas une erreur technique. Les deux cas sont indiscernables dans les dashboards, ce qui provoque de faux positifs dans les alertes de monitoring.

**Exemples de rejets métier (normal — `is_business_rejection = true`) :**
- `matched: false` — aucune tâche d'obligation active pour ce commercial
- Catégorie client `JAMAIS_COMMANDE` — appel hors-périmètre

**Exemples d'erreurs techniques (anomalie — `is_business_rejection = false`) :**
- Timeout DB2, exception dans `resolveClientCategory()`, exception dans `tryMatchCallToTask()`

**Points d'implémentation**

Migration `src/database/migrations/20260508_integration_sync_log_business_rejection.ts` :
- [ ] `ALTER TABLE integration_sync_log ADD COLUMN is_business_rejection TINYINT(1) NOT NULL DEFAULT 0 AFTER last_error`
- [ ] `ADD INDEX IDX_sync_log_business (status, is_business_rejection)`
- [ ] Nommer la classe `IntegrationSyncLogBusinessRejection1746648000001` (convention timestamp 13 chiffres)
- [ ] Implémenter `down()` : `DROP INDEX` + `DROP COLUMN`

`src/integration-sync/entities/integration-sync-log.entity.ts` :
- [ ] Ajouter `@Column({ name: 'is_business_rejection', type: 'tinyint', width: 1, default: 0 }) isBusinessRejection: boolean`

`src/integration-sync/integration-sync-log.service.ts` :
- [ ] Modifier `markFailed(id, error, isBusinessRejection = false)` — paramètre optionnel `isBusinessRejection`

`src/order-call-sync/order-call-sync.service.ts` :
- [ ] Dans `matchObligation()`, quand `result.matched === false` : `markFailed(logId, reason, true)`
- [ ] Dans le `catch` de `syncNewCalls()` : `markFailed(logId, err.message, false)`

**Critères d'acceptation**
- `npx tsc --noEmit` → 0 erreur
- Migration `up()` exécutable sans erreur sur une DB existante
- Les rejets métier apparaissent avec `is_business_rejection = 1` en base
- Les erreurs techniques apparaissent avec `is_business_rejection = 0`
- Le monitoring peut filtrer `WHERE status = 'failed' AND is_business_rejection = 0` pour les vraies alertes

**Rollback**  
Exécuter `migration:revert` → supprime la colonne et l'index. Remettre `markFailed()` à 2 paramètres.

---

### [T3] · [P1] · Tests unitaires `resolveClientCategory()`
**Sprint :** 3 · **Estimation :** S · 🟢

**Contexte**  
`resolveClientCategory()` est la fonction la plus critique du pont DB1↔DB2 — elle détermine la catégorie d'obligation pour chaque appel traité. Elle n'a aucun test unitaire dédié. Un bug silencieux ici fausserait toutes les statistiques d'obligations.

**Points d'implémentation**

Créer `src/order-call-sync/__tests__/resolve-client-category.spec.ts` avec 4 cas :
- [ ] `CAS-01` : résolution directe par `id_client` → `COMMANDE_AVEC_LIVRAISON` (dateLivree IS NOT NULL)
- [ ] `CAS-02` : résolution par téléphone fallback → `COMMANDE_ANNULEE` (trueCancel = 1)
- [ ] `CAS-03` : id_client présent, aucune commande trouvée → `JAMAIS_COMMANDE`
- [ ] `CAS-04` : id_client absent, remoteNumber inconnu dans `users` → `JAMAIS_COMMANDE`

Utiliser le même pattern de mock que `makeOrderDb()` dans `order-call-sync.service.spec.ts` — pas de vraie connexion DB.

**Critères d'acceptation**
- `npx jest resolve-client-category` → 4/4 tests verts
- Aucun appel réseau ou DB réel dans les tests
- Couverture des 4 branches de `resolveClientCategory()`

**Rollback**  
Supprimer le fichier de test. Aucun impact fonctionnel.

---

## Sprint 4 — Protection drift curseur (Jour 2 après-midi)

---

### [T5] · [P2] · Fenêtre de tolérance curseur (lookback + déduplication)
**Sprint :** 4 · **Estimation :** M · 🟢

**Contexte**  
`syncNewCalls()` lit les appels strictement après `(call_timestamp, id)` du curseur. Si DB2 insère des `call_logs` avec un `call_timestamp` antérieur au curseur (insertions tardives, lag réseau, horloge décalée entre serveurs), ces appels sont **définitivement perdus** — jamais rattrapés par les crons suivants.

**Points d'implémentation**

`src/order-call-sync/order-call-sync.service.ts` :
- [ ] Ajouter constante `CURSOR_LOOKBACK_MINUTES = 10` en tête de fichier
- [ ] Dans `syncNewCalls()`, calculer `lookbackSince = cursor.since - CURSOR_LOOKBACK_MINUTES * 60_000`
- [ ] Élargir la clause WHERE DB2 pour inclure `call_timestamp >= lookbackSince`
- [ ] Avant `processCall()`, appeler `syncLogService.existsForEntity('call_validation', call.id.toString())` — skip si déjà traité avec succès (déduplication)

`src/integration-sync/integration-sync-log.service.ts` :
- [ ] Ajouter méthode `existsForEntity(entityType: string, entityId: string): Promise<boolean>` — compte sur l'index `IDX_sync_log_entity` existant

`src/system-config/` :
- [ ] Exposer `CURSOR_LOOKBACK_MINUTES` via `SystemConfigService` (clé `ORDER_CALL_SYNC_LOOKBACK_MINUTES`, défaut `'10'`) — ajustable sans redéploiement

**Critères d'acceptation**
- Un appel inséré dans DB2 avec un `call_timestamp` de 8 min en retard est bien traité au prochain cycle
- Un appel déjà traité avec succès n'est pas retraité (déduplication via `integration_sync_log`)
- `npx tsc --noEmit` → 0 erreur
- Valeur de lookback modifiable via `POST /admin/system-config` sans redémarrage

**Rollback**  
Supprimer `existsForEntity()`, retirer le lookback de la clause WHERE, supprimer la clé system-config. Le comportement strict reprend.

---

## Sprint 5 — Dépendances DB2 (bloqué)

---

### [T6] · [P0] · Création `messaging_client_dossier_mirror` côté DB2
**Sprint :** 5 · **Estimation :** XS · 🔴 Bloqué équipe DB2

**Contexte**  
La table `messaging_client_dossier_mirror` doit être créée manuellement dans DB2 par l'équipe ERP/DB2. Sans elle, chaque appel à `upsertDossier()` lève une exception, les entrées `integration_outbox` s'accumulent en statut `failed` avec backoff jusqu'à 24 h, et **aucun dossier commercial n'est jamais synchronisé**.

**Points d'implémentation**
- [ ] Transmettre `SCHEMA_DB2.md` à l'équipe DB2 (produit par T2)
- [ ] Suivre la création de la table (ticket équipe DB2)
- [ ] Vérifier les droits `SELECT/INSERT/UPDATE` accordés à l'utilisateur DB2 de la plateforme
- [ ] Valider en staging : soumettre un rapport test → vérifier `submission_status = 'sent'` en DB1 et ligne présente en DB2

**Critères d'acceptation**
- `SELECT COUNT(*) FROM messaging_client_dossier_mirror` ne lève pas d'erreur
- Un rapport soumis via l'interface passe de `pending` à `sent` dans `integration_outbox`
- `OutboxAlertService` ne génère plus d'alerte `failed` en continu

**Rollback**  
Sans objet — création de table idempotente. Si la table est supprimée, les retries reprennent automatiquement via l'outbox.

---

### [T7] · [P2] · Mapper `statuts_commandes` (entité + segmentation)
**Sprint :** 5 · **Estimation :** M · 🔴 Bloqué schéma DB2

**Contexte**  
La table `statuts_commandes` de DB2 n'est pas encore mappée. Seule la table `commandes` est utilisée pour la catégorisation. Des cas métier plus fins (livraison partielle, litige, retour) sont impossibles à implémenter sans cette table.

**Prérequis :** obtenir le schéma réel de `statuts_commandes` auprès de l'équipe DB2.

**Points d'implémentation**

`src/order-read/entities/order-command-status.entity.ts` (à créer) :
- [ ] Entité read-only mappée sur `statuts_commandes` DB2
- [ ] Colonnes minimales : `id`, `id_commande`, `statut_code`, `statut_label`, `created_at`
- [ ] Compléter avec les colonnes réelles après confirmation DB2

`src/order-read/order-read.module.ts` :
- [ ] Enregistrer `OrderCommandStatus` dans `TypeOrmModule.forFeature([..., OrderCommandStatus], ORDER_DB_DATA_SOURCE)`

`src/order-call-sync/order-call-sync.service.ts` :
- [ ] Enrichir `resolveClientCategory()` avec une 5e règle basée sur `statuts_commandes`
- [ ] Définition des règles métier avec le product owner avant implémentation

`src/order-read/services/order-segmentation-read.service.ts` :
- [ ] Nouveaux segments possibles : `en_cours_livraison`, `litige`, `retour_marchandise`

**Critères d'acceptation**
- `npx tsc --noEmit` → 0 erreur
- `OrderCommandStatus` lisible depuis DB2 sans écriture
- `resolveClientCategory()` couvre les nouveaux cas définis avec le métier
- Tests mis à jour avec les nouveaux cas

**Rollback**  
Supprimer l'entité et retirer l'enregistrement du module. `resolveClientCategory()` revient à 4 règles.

---

## Résumé par sprint

### Sprint 1 — Nettoyage & documentation
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| T1 | Supprimer `IntegrationListener` stub | P2 | XS |
| T2 | Créer `SCHEMA_DB2.md` | P0 | XS |

**Résultat attendu :** code nettoyé, documentation DB2 disponible pour l'équipe ERP, T6 débloqué.

---

### Sprint 2 — Synchronisation au redémarrage
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| T8 | Sync complète au redémarrage (fire & forget) | P1 | S |

**Résultat attendu :** zéro angle mort après un redémarrage — les appels DB2 et l'outbox sont rattrapés immédiatement.

---

### Sprint 3 — Fiabilité logs
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| T4 | Champ `is_business_rejection` dans `integration_sync_log` | P1 | S |
| T3 | Tests unitaires `resolveClientCategory()` (4 cas) | P1 | S |

**Résultat attendu :** monitoring fiable (faux positifs éliminés), fonction critique couverte par des tests.

---

### Sprint 4 — Robustesse curseur
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| T5 | Fenêtre de tolérance curseur + déduplication | P2 | M |

**Résultat attendu :** les appels DB2 avec insertion tardive (< 10 min) ne sont plus perdus.

---

### Sprint 5 — Dépendances DB2 (bloqué)
| Ticket | Titre | Priorité | Effort |
|--------|-------|----------|--------|
| T6 | Créer `messaging_client_dossier_mirror` en DB2 | P0 | XS |
| T7 | Mapper `statuts_commandes` | P2 | M |

**Résultat attendu :** synchronisation DB1 → DB2 fonctionnelle, segmentation enrichie.

---

## Tableau récapitulatif — tous tickets

| Ticket | Titre | Sprint | Priorité | Effort | Bloqué |
|--------|-------|--------|----------|--------|--------|
| T1 | Supprimer `IntegrationListener` | 1 | P2 | XS | Non |
| T2 | Créer `SCHEMA_DB2.md` | 1 | P0 | XS | Non |
| T8 | Sync au redémarrage (bootstrap) | 2 | P1 | S | Non |
| T4 | `is_business_rejection` dans sync_log | 3 | P1 | S | Non |
| T3 | Tests `resolveClientCategory()` | 3 | P1 | S | Non |
| T5 | Fenêtre de tolérance curseur | 4 | P2 | M | Non |
| T6 | Table `messaging_client_dossier_mirror` DB2 | 5 | P0 | XS | Oui — équipe DB2 |
| T7 | Mapper `statuts_commandes` | 5 | P2 | M | Oui — schéma DB2 |

---

*Backlog généré le 2026-05-08 · Source : PLAN_IMPLEMENTATION_RECOMMANDATIONS_DB_SYNC.md*
