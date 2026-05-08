# Rapport de Synchronisation DB1 ↔ DB2

**Date :** 2026-05-08  
**Projet :** WhatsApp Messagerie Platform  
**Répertoire analysé :** `message_whatsapp/src`

---

## 1. Architecture générale

```
┌──────────────────────────────────────────────────────────────────┐
│                        DB1 (MySQL messagerie)                    │
│  Connexion principale TypeORM (DATABASE_HOST/PORT/USER/PASS/NAME)│
│                                                                  │
│  Tables lues par les services sync :                             │
│  • whatsapp_commercial       • contact                           │
│  • client_identity_mapping   • commercial_identity_mapping       │
│  • contact_phone             • client_dossier                    │
│  • whatsapp_chat             • conversation_report               │
│                                                                  │
│  Tables écrites après traitement DB2 :                           │
│  • integration_sync_log      • order_call_sync_cursor            │
│  • commercial_identity_mapping (mise à jour mapping)             │
│  • call_task / commercial_obligation_batch (obligations)         │
│  • integration_outbox        • conversation_report               │
└────────────────┬─────────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐    ┌────────────────────────────────┐
    │  LECTURE (sens DB2→DB1)  │    │   ÉCRITURE (sens DB1→DB2)      │
    │  OrderCallSyncService    │    │   OrderDossierMirrorWriteService│
    │  OrderSegmentationRead   │    │   (via OutboxProcessorService   │
    │  OrderDbRepository       │    │    + ReportClosureMirrorListener│
    └────────────┬─────────────┘    └────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────────┐
│                       DB2 (MySQL ERP/commandes)                  │
│  Connexion séparée TypeORM (ORDER_DB_HOST/PORT/USER/PASSWORD/NAME)│
│                                                                  │
│  Tables DB2 LUES (jamais écrites par nous) :                     │
│  • call_logs                 • commandes                         │
│  • users (GICOP users)                                           │
│                                                                  │
│  Table DB2 ÉCRITE par nous :                                     │
│  • messaging_client_dossier_mirror                               │
└──────────────────────────────────────────────────────────────────┘
```

**Flux DB2 → DB1 :** `OrderCallSyncJob` (cron 5 min) lit `call_logs` dans DB2, résout la catégorie client via `commandes` et `users`, puis enregistre dans `call_task` (DB1) et fait avancer le curseur dans `order_call_sync_cursor` (DB1).

**Flux DB1 → DB2 :** `ReportSubmissionService` enfile dans `integration_outbox` (DB1). `OutboxProcessorService` (cron 1 min) déqueule et appelle `OrderDossierMirrorWriteService.upsertDossier()` qui écrit dans `messaging_client_dossier_mirror` (DB2).

**Flux lecture segmentation :** `OrderSegmentationReadService` interroge directement `commandes` DB2 via `ORDER_DB_DATA_SOURCE` pour produire des listes de clients (annulés, sans livraison, dormants).

---

## 2. Connexion DB2

**Fichier :** `src/order-db/order-db.module.ts`

La connexion est entièrement gérée par `OrderDbModule` (module `@Global()`). Trois tokens sont exportés :

| Token                  | Type                  | Usage                                       |
|------------------------|-----------------------|---------------------------------------------|
| `ORDER_DB_DATA_SOURCE` | `DataSource \| null`  | Connexion TypeORM brute vers DB2            |
| `ORDER_DB_AVAILABLE`   | `boolean`             | Flag null-safe injecté dans les services    |
| `OrderDbRepository`    | service               | Méthodes de lecture DB2 encapsulées         |

**Variables d'environnement requises :**
- `ORDER_DB_HOST` (obligatoire — si absent, DB2 désactivée silencieusement)
- `ORDER_DB_PORT`
- `ORDER_DB_USER`
- `ORDER_DB_PASSWORD`
- `ORDER_DB_NAME`

**Comportement null-safe :** si `ORDER_DB_HOST` est absent ou si la connexion échoue, `DataSource` vaut `null`, `ORDER_DB_AVAILABLE` vaut `false`, et tous les services retournent des résultats vides sans lever d'exception. L'application démarre normalement.

**Pool de connexions :** `connectionLimit: 5`, `connectTimeout: 10 000 ms`, `keepAlive: 30 000 ms`.

`synchronize: false` et `migrationsRun: false` — aucune DDL jamais exécutée sur DB2.

---

## 3. Tables DB2 lues

### 3.1 `call_logs`
**Entité :** `src/order-read/entities/order-call-log.entity.ts`

| Colonne lue        | Propriété TypeORM | Usage                                         |
|--------------------|-------------------|-----------------------------------------------|
| `id`               | `id`              | Clé primaire, tie-breaker curseur             |
| `id_commercial`    | `idCommercial`    | Résolution directe du commercial DB2          |
| `id_client`        | `idClient`        | Résolution directe du client DB2              |
| `call_type`        | `callType`        | Filtrage `outgoing` / `missed`                |
| `local_number`     | `localNumber`     | Fallback identification commercial            |
| `remote_number`    | `remoteNumber`    | Fallback identification client                |
| `duration`         | `duration`        | Vérification durée ≥ 90 s pour obligations    |
| `call_timestamp`   | `callTimestamp`   | Curseur temporel de la lecture incrémentale   |
| `device_id`        | `deviceId`        | Corrélation avec `users.device_id`            |

Constantes exportées : `ORDER_CALL_TYPE_MISSED = 'missed'`, `ORDER_CALL_TYPE_OUTGOING = 'outgoing'`, `ORDER_CALL_MIN_DURATION_SEC = 90`.

### 3.2 `commandes`
**Entité :** `src/order-read/entities/order-command.entity.ts`

| Colonne lue             | Propriété TypeORM   | Usage                                       |
|-------------------------|---------------------|---------------------------------------------|
| `id_client`             | `idClient`          | Jointure pour trouver les commandes d'un client |
| `id_commercial`         | `idCommercial`      | Filtrage par commercial                     |
| `true_cancel`           | `trueCancel`        | Catégorie `COMMANDE_ANNULEE`                |
| `date_livree`           | `dateLivree`        | Catégorie `COMMANDE_AVEC_LIVRAISON`         |
| `is_order_confirmed`    | `isOrderConfirmed`  | Filtre commandes confirmées                 |
| `date_livraison`        | `dateLivraison`     | Dates associées                             |
| `date_annulation`       | `dateAnnulation`    | Date annulation                             |
| `motif_annulation`      | `motifAnnulation`   | Motif pour segmentation                     |
| `date_enreg`            | `dateEnreg`         | Date d'enregistrement (clients dormants)    |
| `valid`                 | `valid`             | Filtre suppression logique (= 1)            |

### 3.3 `users`
**Entité :** `src/order-read/entities/giocop-user.entity.ts`

| Colonne lue | Propriété TypeORM | Usage                                             |
|-------------|-------------------|---------------------------------------------------|
| `id`        | `id`              | ID DB2 du commercial ou client                    |
| `type`      | `type`            | 0 = client, 1 = commercial                        |
| `phone`     | `phone`           | Numéro SIM commercial (pont par téléphone)        |
| `phone2`    | `phone2`          | Téléphone secondaire client                       |
| `id_poste`  | `idPoste`         | Filtre commerciaux (IS NOT NULL = commercial)     |
| `device_id` | `deviceId`        | Corrélation avec `call_logs.device_id`            |
| `valid`     | `valid`           | Filtre actifs uniquement                          |

---

## 4. Tables DB1 écrites suite aux lectures DB2

| Table DB1 écrite                 | Qui écrit                                         | Quand                                              |
|----------------------------------|---------------------------------------------------|----------------------------------------------------|
| `order_call_sync_cursor`         | `OrderCallSyncService`                            | Après chaque batch de `call_logs` traités          |
| `integration_sync_log`           | `OrderCallSyncService` + `OrderDossierMirrorWriteService` | À chaque opération de sync                  |
| `commercial_identity_mapping`    | `OrderCallSyncService.syncCommercialMapping()`    | Cron 5 min + au démarrage                          |
| `call_task`                      | `CallObligationService.tryMatchCallToTask()`      | Quand appel sortant valide une obligation          |
| `integration_outbox`             | `ReportSubmissionService.submitReport()`          | Quand le commercial soumet un rapport              |

### Table DB2 écrite par nous

| Table DB2 écrite                    | Qui écrit                             | Quand                                              |
|-------------------------------------|---------------------------------------|----------------------------------------------------|
| `messaging_client_dossier_mirror`   | `OrderDossierMirrorWriteService`      | Via outbox (soumission rapport) + événement `conversation.closed` |

---

## 5. Mécanisme de pont

### 5.1 Pont commercial (DB1 UUID → DB2 int)
Table intermédiaire DB1 : `commercial_identity_mapping` (`commercial_id` CHAR(36) ↔ `external_id` INT)

**Construction du pont :** `OrderCallSyncService.syncCommercialMapping()` :
1. Charge tous les commerciaux DB1 (`whatsapp_commercial`) avec leur numéro de téléphone.
2. Charge tous les commerciaux DB2 (`users` avec `type=1` et `id_poste IS NOT NULL`).
3. Normalise les numéros des deux côtés (chiffres uniquement).
4. Apparie par numéro normalisé → crée ou met à jour `commercial_identity_mapping`.

### 5.2 Pont client (DB1 UUID → DB2 int)
Table intermédiaire DB1 : `client_identity_mapping` (`contact_id` CHAR(36) ↔ `external_id` INT, `phone_normalized`)

Ce mapping est alimenté manuellement ou via `IntegrationService.upsertClientMapping()`.

### 5.3 Résolution de catégorie client (`OrderCallSyncService.resolveClientCategory()`)

```
appel reçu de call_logs
        │
        ├─ id_client présent → requête directe sur commandes (WHERE id_client = ...)
        │
        └─ id_client absent → normaliser remote_number
                            → chercher dans users (phone = ? OR phone2 = ?)
                            → récupérer id DB2
                            → requête sur commandes

        Règle de catégorisation :
        • Aucune commande trouvée           → JAMAIS_COMMANDE
        • trueCancel = 1                    → COMMANDE_ANNULEE
        • dateLivree IS NOT NULL            → COMMANDE_AVEC_LIVRAISON
        • Commande sans livraison confirmée → JAMAIS_COMMANDE (défaut)
```

La catégorie résolue est transmise directement à `CallObligationService.tryMatchCallToTask()` via le paramètre `resolvedCategory`, ce qui bypasse toute résolution supplémentaire.

### 5.4 Résolution inverse pour la segmentation (`OrderSegmentationReadService`)
`idClientDb2` (int DB2) → `contactId` (UUID DB1) via `client_identity_mapping.external_id`.

---

## 6. Jobs de synchronisation

### 6.1 `OrderCallSyncJob` — synchronisation call_logs DB2 → DB1
**Fichier :** `src/order-call-sync/order-call-sync.job.ts`

| Propriété           | Valeur                                            |
|---------------------|---------------------------------------------------|
| Fréquence           | `*/5 * * * *` (toutes les 5 min)                  |
| Lock distribué      | `cron:order-call-sync` via Redlock, TTL 450 000 ms |
| Fallback sans Redis | Flag in-process `this.running`                    |
| Taille de batch     | 200 appels par cycle                              |
| Au démarrage        | `onApplicationBootstrap()` → `syncCommercialMapping()` |

**Logique d'un cycle :**
1. Vérification lock (Redis/in-process) — skip si déjà en cours.
2. `syncCommercialMapping()` — mise à jour `commercial_identity_mapping`.
3. `syncNewCalls()` — lecture incrémentale de `call_logs` depuis le curseur.
4. Pour chaque appel : `processCall()` (crée `integration_sync_log`) puis, si `callType = 'outgoing'`, `matchObligation()`.
5. Avancement du curseur avec tie-breaker `(call_timestamp, id)`.

**Verrou anti-doublon :** flag `this.running = true` pour une même instance, Redlock pour le cas multi-instances.

**Comportement si DB2 indisponible :** retour immédiat `{ processed: 0, obligations: 0, errors: 0 }` sans log d'erreur.

### 6.2 `OutboxProcessorService` — synchronisation DB1 → DB2 (dossiers)
**Fichier :** `src/gicop-report/outbox-processor.service.ts`

| Propriété         | Valeur                                    |
|-------------------|-------------------------------------------|
| Fréquence         | `EVERY_MINUTE`                            |
| Batch size        | 20 entrées par cycle                      |
| Backoff           | Exponentiel : 2^attempt × 60 s, max 24 h  |
| Flag anti-doublon | `this.processing = true`                  |

**Logique :** réclame 20 entrées `pending` ou `failed-and-due` dans `integration_outbox`, exécute `upsertDossier()` vers DB2 pour chacune, met à jour `conversation_report.submission_status`.

### 6.3 `OutboxAlertService` — surveillance santé outbox
**Fréquence :** `*/5 * * * *`
- Alerte stale pending : > 10 min d'attente → notification
- Alerte failed : ≥ 5 entrées en échec → notification
- Cooldown : 30 min entre deux alertes

### 6.4 `ReportSubmissionService.autoRetryFailedReports()` — legacy retry
**Fréquence :** `0 * * * *` (toutes les heures). Retrouve les rapports en statut `failed` et les resoumet. Qualifié de "legacy" dans le code — l'outbox est la voie principale.

---

## 7. Journal de synchronisation (`IntegrationSyncLog`)

**Fichier entité :** `src/integration-sync/entities/integration-sync-log.entity.ts`  
**Migration :** `IntegrationSyncLog1745942400004`  
**Table DB1 :** `integration_sync_log`

| Colonne          | Type                                                                                          | Rôle                                               |
|------------------|-----------------------------------------------------------------------------------------------|----------------------------------------------------|
| `id`             | CHAR(36) UUID                                                                                 | Clé primaire                                       |
| `entity_type`    | ENUM (`client_dossier`, `conversation_closure`, `call_validation`, `follow_up`)               | Type d'entité synchronisée                         |
| `entity_id`      | VARCHAR(36)                                                                                   | Identifiant local DB1 de l'entité                  |
| `target_table`   | VARCHAR(100)                                                                                  | Table cible (ex: `call_logs`, `messaging_client_dossier_mirror`) |
| `status`         | ENUM (`pending`, `success`, `failed`)                                                         | Statut de la synchronisation                       |
| `attempt_count`  | INT                                                                                           | Nombre de tentatives                               |
| `last_error`     | TEXT (max 2000 car.)                                                                          | Dernière erreur (tronquée)                         |
| `synced_at`      | TIMESTAMP NULL                                                                                | Date de succès                                     |

**Index :** `IDX_sync_log_entity (entity_type, entity_id)`, `IDX_sync_log_status (status, created_at)`, `IDX_sync_log_pending (status, attempt_count)`.

**API :** `createPending()`, `markSuccess()`, `markFailed()` (incrémente `attempt_count`), `findFailed(50)`, `findPending(100)`, `countByStatus()`, `purgeOldSuccess(30 jours)`.

---

## 8. Flux GICOP Report

Le flux de soumission de rapport ne lit pas DB2 — il ne fait qu'y écrire. Voici le chemin complet :

```
Commercial (frontend) → POST /gicop-report/:chatId/submit
                               │
                        ReportSubmissionService.submitReport()
                               │
                        Transaction DB1 atomique :
                        ├── conversation_report.is_submitted = true
                        └── integration_outbox.enqueue('REPORT_SUBMITTED', chatId, payload)
                               │
                   [event emitter] conversation.report.submitted
                               │
                        OutboxProcessorService (cron 1 min)
                               │
                        OrderDossierMirrorWriteService.upsertDossier()
                               │
                        ├── Résolution commercial (DB1: commercial_identity_mapping)
                        ├── Résolution client (DB1: client_identity_mapping)
                        └── UPSERT DB2: messaging_client_dossier_mirror
                               │
                    Mise à jour DB1: conversation_report.submission_status = 'sent'
```

**Déclencheur alternatif :** l'événement `conversation.closed` déclenche `ReportClosureMirrorListener`, qui exécute directement `upsertDossier()` (sans passer par l'outbox), en priorisant `ClientDossier` sur `ConversationReport`.

**Données écrites dans `messaging_client_dossier_mirror` :**
- Identifiants : `messaging_chat_id` (PK), `id_client` (int DB2), `id_commercial` (int DB2)
- Contact : `client_messaging_contact`, `client_phones` (JSON)
- Données commerciales : `client_name`, `commercial_name/phone/email`, `ville/commune/quartier`, `product_category`, `client_need`, `interest_score`, `next_action`, `follow_up_at`, `notes`
- Fermeture : `conversation_result`, `closed_at`
- Statut : `sync_status` (pending/synced/error), `submitted_at`

---

## 9. Ce qui est implémenté vs bloqué

### Epic A — Connexion DB2 null-safe ✅ LIVRÉ
- `src/order-db/` complet : `OrderDbModule`, `OrderDbRepository`, constantes.
- `ORDER_DB_DATA_SOURCE` injectable dans toute l'application.
- Null-safe : l'absence de `ORDER_DB_HOST` ne bloque pas le démarrage.

### Epic D — Journal de synchronisation local ✅ LIVRÉ
- `src/integration-sync/` : `IntegrationSyncLog`, `IntegrationSyncLogService`.
- Migration `IntegrationSyncLog1745942400004` présente.
- Utilisé dans `OrderCallSyncService` et `OrderDossierMirrorWriteService`.

### Epic B — Lecture synchronisée des commandes ⚠️ PARTIELLEMENT LIVRÉ
**Fait :**
- Entité `OrderCommand` (`commandes`) mappée.
- `OrderSegmentationReadService` : segments `cancelled`, `without_delivery`, `dormant`.
- `resolveClientCategory()` utilise `commandes`.

**Bloqué :** la table `statuts_commandes` n'est pas encore mappée (aucune entité). Seule la table `commandes` est utilisée pour les statuts.

### Epic C — Lecture des call_logs et obligations appels ✅ LIVRÉ (plus avancé que prévu)
- `OrderCallLog`, `OrderCallSyncService`, `OrderCallSyncJob`, `OrderCallSyncCursor` : complets.
- Migration `OrderCallSyncCursor1745942400005` présente.
- `CallObligationService.tryMatchCallToTask()` : moteur d'obligations câblé.
- `CommercialIdentityMapping` et `ClientIdentityMapping` : synchronisation automatique.

### Table `messaging_client_dossier_mirror` dans DB2 ⚠️ CODE PRÊT — DÉPEND DE L'ÉQUIPE DB2
- L'entité et `OrderDossierMirrorWriteService` sont prêts.
- La migration existe en DB1 mais **la table doit être créée manuellement par l'équipe DB2**. Le DDL SQL est fourni dans le service.

---

## 10. Points de risque

### R1 — Catégorie client non résolue (défaut `JAMAIS_COMMANDE`)
Si `remote_number` est absent, reformaté ou inconnu de `users.phone`, la résolution par téléphone échoue. Le résultat par défaut est `JAMAIS_COMMANDE`, ce qui peut fausser les statistiques d'obligations si un client pourtant connu dans DB2 n'est pas trouvé.

**Mitigation partielle :** si `id_client` est présent dans `call_logs`, la résolution est directe et fiable.

### R2 — `statuts_commandes` non mappée
Certains cas de segmentation avancée ne peuvent pas être implémentés tant que cette table n'est pas mappée en entité TypeORM. Confirmation du schéma réel requise avec l'équipe DB2.

### R3 — Atomicité limitée de l'outbox
La transaction DB1 couvre `conversation_report` + `integration_outbox`. L'écriture dans `messaging_client_dossier_mirror` (DB2) se fait ensuite hors transaction. En cas de crash entre les deux : `submission_status = 'failed'` + retry automatique (backoff exponentiel) gèrent la récupération.

### R4 — Table `messaging_client_dossier_mirror` absente en DB2
Si l'équipe DB2 n'a pas créé la table, chaque appel à `upsertDossier()` lèvera une exception, `submission_status` passera en `failed`, et l'outbox accumulera des entrées en échec avec backoff jusqu'à 24 h.

### R5 — Race condition commerciaux (`syncCommercialMapping` vs batch sync)
Le job cron exécute d'abord `syncCommercialMapping()` puis `syncNewCalls()` dans le même cycle. Le lock Redlock (TTL 450 000 ms) protège entre instances. Si une instance crash, le lock expire au bout de 7,5 min.

### R6 — Doublons potentiels dans `integration_sync_log`
Un appel DB2 peut apparaître avec le statut `failed` si `tryMatchCallToTask()` retourne `matched: false` (cas normal : aucune tâche en attente). Ces entrées ne représentent pas nécessairement des erreurs techniques mais des rejets métier — aucune distinction dans le statut actuel.

### R7 — `ReportClosureMirrorListener` double-écriture
Quand une conversation est fermée ET que le commercial a soumis un rapport, les deux chemins (outbox + listener `conversation.closed`) peuvent déclencher deux `upsertDossier()` quasi-simultanément. L'upsert est idempotent (`ON DUPLICATE KEY UPDATE`), donc pas de doublon, mais deux écritures inutiles en DB2.

### R8 — `IntegrationListener` stub vide
`src/integration/integration.listener.ts` est un stub vide (`@Injectable()` sans méthodes). Référencé dans le module mais ne fait rien — à supprimer lors du prochain nettoyage.

---

## 11. Recommandations

1. **Mapper `statuts_commandes`** : créer `src/order-read/entities/order-command-status.entity.ts` pour débloquer les Epics B+C complets. Confirmer d'abord le schéma réel avec l'équipe DB2.

2. **Distinguer rejets métier / erreurs techniques dans `integration_sync_log`** : ajouter un champ `is_business_rejection: boolean` pour éviter les faux positifs dans les dashboards de monitoring.

3. **Confirmer la création de `messaging_client_dossier_mirror` côté DB2** : le DDL SQL est disponible dans `src/order-write/services/order-dossier-mirror-write.service.ts`. Sans cette table, le flux de soumission de rapport est intégralement bloqué (retry en background silencieux).

4. **Supprimer `IntegrationListener`** : le stub vide dans `src/integration/integration.listener.ts` ajoute du bruit sans valeur.

5. **Ajouter un test d'intégration sur `resolveClientCategory()`** : c'est la fonction la plus critique du pont. Un test avec les quatre cas (aucune commande, annulée, livrée, en cours) est indispensable.

6. **Surveiller le drift du curseur** : si `call_logs` reçoit des appels avec des `call_timestamp` antérieurs au curseur (insertions tardives DB2), ils seront définitivement perdus. Prévoir une fenêtre de tolérance ou un job de rattrapage.

7. **Formaliser le DDL DB2 dans un fichier dédié** : créer `SCHEMA_DB2.md` avec le DDL de `messaging_client_dossier_mirror` pour que l'équipe DB2 puisse l'appliquer de façon traçable et versionnée.
