# Rapport d'Audit — Synchronisation DB1 ↔ DB2

> **Date** : 2026-05-09  
> **Projet** : WhatsApp Messagerie E-GICOP  
> **Portée** : Synchronisation complète entre DB1 (MySQL messagerie) et DB2 (ERP GICOP)

---

## 1. Architecture Générale

**Modèle de synchronisation :**
- **DB1** (MySQL messagerie) : Source locale — conversations, contacts, dossiers clients
- **DB2** (ERP GICOP) : Source de vérité externe — commandes, clients, appels, commerciaux
- **Direction** : Bidirectionnel avec asymétrie (DB2 = source de vérité ERP ; DB1 écrit uniquement dans `messaging_client_dossier_mirror`)

```
┌──────────────────────────────────────────────────────────────────┐
│                        DB1 (MySQL messagerie)                    │
│  Tables lues par les services sync :                             │
│  • whatsapp_commercial       • contact                           │
│  • client_identity_mapping   • commercial_identity_mapping       │
│  • whatsapp_chat             • conversation_report               │
│                                                                  │
│  Tables écrites après traitement DB2 :                           │
│  • integration_sync_log      • order_call_sync_cursor            │
│  • commercial_identity_mapping (mise à jour mapping)             │
│  • call_task / commercial_obligation_batch (obligations)         │
│  • call_event                • call_device                       │
│  • integration_outbox        • conversation_report               │
└────────────────┬─────────────────────────────────────────────────┘
                 │
    ┌────────────▼─────────────┐    ┌────────────────────────────────┐
    │  LECTURE (DB2 → DB1)     │    │   ÉCRITURE (DB1 → DB2)         │
    │  OrderCallSyncService    │    │   OrderDossierMirrorWriteService│
    │  OrderDbRepository       │    │   (via OutboxProcessorService)  │
    └────────────┬─────────────┘    └────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────────────────────┐
│                       DB2 (MySQL ERP/commandes)                  │
│  Tables DB2 LUES (jamais écrites par nous) :                     │
│  • call_logs                 • commandes                         │
│  • users (GICOP users)       • statuts_commandes                 │
│                                                                  │
│  Table DB2 ÉCRITE par nous :                                     │
│  • messaging_client_dossier_mirror                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure de Connexion DB2

**Chemin** : `src/order-db/`

### 2.1 Constantes (`order-db.constants.ts`)

| Token | Valeur | Usage |
|-------|--------|-------|
| `ORDER_DB_CONNECTION` | `'order-db'` | Nom DataSource TypeORM |
| `ORDER_DB_DATA_SOURCE` | `'ORDER_DB_DATA_SOURCE'` | Token injection |
| `ORDER_DB_AVAILABLE` | `'ORDER_DB_AVAILABLE'` | Flag disponibilité booléen |

### 2.2 Module (`order-db.module.ts`)

- Variables d'env : `ORDER_DB_HOST`, `ORDER_DB_PORT`, `ORDER_DB_USER`, `ORDER_DB_PASSWORD`, `ORDER_DB_NAME`
- `synchronize: false` — aucune DDL générée sur DB2
- `migrationsRun: false` — aucune migration sur DB2
- Pool MySQL : 5 connexions max, queue 50, keep-alive 30s
- **Graceful degradation** : si `ORDER_DB_HOST` absent ou connexion échoue → retourne `null`, l'application démarre quand même

**Entités déclarées dans le DataSource :**
- `OrderCommand` → table `commandes`
- `OrderCallLog` → table `call_logs`
- `GicopUser` → table `users`
- `OrderCommandStatus` → table `statuts_commandes`
- `MessagingClientDossierMirror` → table `messaging_client_dossier_mirror` (seule table écrite)

### 2.3 Repository (`order-db.repository.ts`)

| Méthode | Description |
|---------|-------------|
| `findCallLogsAfterCursor(since, lastId, batchSize)` | Lecture batch avec tie-breaker timestamp+id |
| `findMissedCallsSince(localNumber, since)` | Appels manqués par numéro commercial |
| `findClientByPhone(phoneNormalized)` | Résolution client DB2 via téléphone |
| `findLatestOrderByClient(clientIdDb2)` | Dernière commande d'un client |
| `findCancelledOrdersByCommercial(idCommercial)` | Commandes annulées par commercial |
| `findOrdersWithoutDeliveryByCommercial(idCommercial)` | Commandes confirmées non livrées |
| `findDormantClientsByCommercial(idCommercial, cutoff)` | Clients inactifs depuis N jours |

> Toutes les méthodes vérifient `this.orderDb !== null` — retour tableau vide si DB2 indisponible.

---

## 3. Entités DB2 (Read-Only)

**Chemin** : `src/order-read/entities/`

### 3.1 `order-command.entity.ts` → table `commandes`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | int PK | Identifiant commande |
| `idClient` | int | FK clients (résolu via `client_identity_mapping.external_id`) |
| `idCommercial` | int | FK commerciaux (résolu via `commercial_identity_mapping.external_id`) |
| `statut` | int | Statut commande |
| `etat` | int | État livraison |
| `trueCancel` | tinyint | Flag annulation explicite |
| `valid` | int | Soft delete (0 = supprimé) |
| `dateEnreg`, `dateAnnulation`, `dateLivree` | datetime | Timeline commande |

Index : `idx_cmd_fast` (valid, statut, etat, dateEnreg), `idx_cmd_valid_etat`

### 3.2 `order-call-log.entity.ts` → table `call_logs`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | varchar(36) PK | UUID appel |
| `deviceId` | varchar(100) | ID téléphone commercial |
| `callType` | varchar(20) | MISSED / INCOMING / OUTGOING / REJECTED |
| `localNumber` | varchar(30) | Numéro SIM commercial |
| `remoteNumber` | varchar(30) | Numéro client |
| `callTimestamp` | datetime | Horodatage appel |
| `receivedAt` | datetime | Horodatage ingestion |
| `duration` | int | Durée en secondes |

> Seuls les appels `OUTGOING ≥ 90s` sont éligibles aux obligations (OBL-007).

### 3.3 `giocop-user.entity.ts` → table `users`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | int PK | Identifiant utilisateur |
| `type` | int | 0 = client, 1 = commercial |
| `idPoste` | int nullable | FK poste (si commercial) |
| `deviceId` | varchar(100) | Identifiant matériel téléphone |
| `phone`, `phone2` | varchar | Numéros primaire + secondaire |
| `statut` | tinyint | 1 = actif |
| `valid` | tinyint | 1 = non supprimé |

### 3.4 `order-command-status.entity.ts` → table `statuts_commandes`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | int PK | Identifiant statut |
| `idCommande` | int | FK commandes |
| `typeUser` | varchar | Rôle utilisateur (ex : 'livreur') |
| `etat` | int | Code état livraison |
| `dateEnreg` | datetime | Horodatage changement état |

> États retour connus : `[2, 4, 99]` = retour stock/livraison non confirmée.

---

## 4. Synchronisation Appels DB2 → DB1

**Chemin** : `src/order-call-sync/`

### 4.1 Flux principal

```
DB2.call_logs
  ↓ (cron 30s)
OrderCallSyncService.syncNewCalls()
  ├─ Charge curseur (lastCallTimestamp + lastCallId)
  ├─ Requête DB2 batch 200 appels (WHERE timestamp > cursor avec tie-breaker)
  ├─ Pré-résolution commerciaux (phone → DB1 uuid)
  ├─ Pré-résolution devices (device_id → call_device → poste)
  ├─ Pour chaque appel :
  │  ├─ CallEventService.ingestFromDb2() → INSERT IGNORE (external_id unique)
  │  ├─ Auto-découverte device → UPSERT call_device
  │  ├─ IntegrationSyncLogService.createPending('call_validation', call.id, 'call_logs')
  │  ├─ Si OUTGOING ≥ 90s :
  │  │  └─ CallObligationService.tryMatchCallToTask()
  │  │     ├─ Résout poste (phone → commercial → poste ou device → poste)
  │  │     ├─ Résout catégorie (phone → Contact.client_category ou DB2 commandes)
  │  │     ├─ Trouve tâche PENDING batch actif
  │  │     └─ Mark DONE + incrément batch counter
  │  └─ IntegrationSyncLogService.markSuccess/markFailed()
  └─ Avancer curseur + recalculer device_counts

Résultat : { processed: number; obligations: number; errors: number }
```

### 4.2 Flux retry obligations (cron 5min)

```
OrderCallSyncJob.retryUnmatchedObligations()
  ├─ CallEventService.findEligibleForRetry()
  │  └─ Cherche : OUTGOING, ≥90s, sans success sync_log, avec commercial_id OU device_id
  ├─ Pour chaque candidat :
  │  ├─ Résout poste (commercial_id → poste ou device_id → call_device → poste)
  │  ├─ IntegrationSyncLogService.createPending('call_validation', external_id, 'call_event')
  │  ├─ CallObligationService.tryMatchCallToTask()
  │  └─ markSuccess/markFailed sync_log
  └─ Log : "retried=X, matched=Y"
```

### 4.3 Paramètres clés

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `CURSOR_SCOPE` | `'global'` | Une seule ligne dans `order_call_sync_cursor` |
| `BATCH_SIZE` | 200 | Appels max par batch |
| `CURSOR_LOOKBACK_MINUTES` | 2 | Configurable via `ORDER_CALL_SYNC_LOOKBACK_MINUTES` |

### 4.4 Crons (`order-call-sync.job.ts`)

| Cron | Méthode | Verrou distribué |
|------|---------|-----------------|
| `*/30 * * * * *` | `syncNewCalls()` | `cron:order-call-sync` (29s) |
| `0 */5 * * * *` | `retryUnmatchedObligations()` | `cron:retry-obligations` (270s) |
| Boot | `syncNewCalls()` | — |

### 4.5 Endpoints admin (`order-sync-admin.controller.ts`)

| Endpoint | Méthode | Objet |
|----------|---------|-------|
| `GET /admin/order-sync/status` | `getStatus()` | État global DB2 + sync_log counts |
| `GET /admin/order-sync/failed` | `getFailed()` | 50 entrées sync_log échouées |
| `POST /admin/order-sync/sync-commercial-mapping` | `syncCommercialMapping()` | Force sync mapping commerciaux |
| `POST /admin/order-sync/sync-client-mapping` | `syncClientMapping()` | Force sync mapping clients |
| `POST /admin/order-sync/sync-calls` | `syncNewCalls()` | Force sync appels immédiate |
| `POST /admin/order-sync/retry-obligations` | `retryUnmatchedObligations()` | Force retry obligations |

---

## 5. Journal de Synchronisation

**Chemin** : `src/integration-sync/`

### 5.1 Entité (`integration_sync_log`)

| Champ | Type | Rôle |
|-------|------|------|
| `id` | uuid PK | Identifiant log |
| `entityType` | enum | `client_dossier` / `conversation_closure` / `call_validation` / `follow_up` |
| `entityId` | varchar(36) | UUID local (chat_id, contact_id, call_id…) |
| `targetTable` | varchar(100) | Table destination |
| `status` | enum | `pending` / `success` / `failed` |
| `attemptCount` | int | Nombre de retentatives |
| `lastError` | text | Message erreur (max 2000 car.) |
| `isBusinessRejection` | boolean | Distinction erreur technique vs règle métier |
| `syncedAt` | timestamp | Moment du succès |

### 5.2 Service (`integration-sync-log.service.ts`)

| Méthode | Description |
|---------|-------------|
| `createPending(entityType, entityId, targetTable)` | Crée log 'pending' |
| `markSuccess(id)` | status='success', syncedAt=now |
| `markFailed(id, error, isBusinessRejection)` | status='failed', attemptCount++, lastError tronqué |
| `existsForEntity(entityType, entityId)` | Vérification déduplication |
| `purgeOldSuccess(days=30)` | Supprime entrées success > N jours |

---

## 6. Obligations d'Appels

**Chemin** : `src/call-obligations/`

### 6.1 Architecture

```
CommercialObligationBatch (par poste, status pending/complete)
  ├─ 5 × CallTask (COMMANDE_ANNULEE)
  ├─ 5 × CallTask (COMMANDE_AVEC_LIVRAISON)
  └─ 5 × CallTask (JAMAIS_COMMANDE)
```

### 6.2 Entité `commercial_obligation_batch`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | uuid PK | Identifiant batch |
| `posteId` | uuid | FK whatsapp_poste |
| `batchNumber` | int | Séquence par poste |
| `status` | enum | `pending` / `complete` |
| `annuleeDone`, `livreeDone`, `sansCommandeDone` | int | Compteurs (0-5+) |
| `qualityCheckPassed` | boolean | Résultat contrôle qualité messages |
| `completedAt` | timestamp | Transition → COMPLETE |

### 6.3 Entité `call_task`

| Champ | Type | Rôle |
|-------|------|------|
| `id` | uuid PK | Identifiant tâche |
| `batchId` | uuid | FK batch |
| `category` | enum | `commande_annulee` / `commande_avec_livraison` / `jamais_commande` |
| `status` | enum | `pending` / `done` |
| `clientPhone` | varchar(50) | Renseigné à validation |
| `callEventId` | varchar(100) | Lien `call_logs.id` DB2 |
| `durationSeconds` | int | Durée appel |
| `completedAt` | timestamp | Horodatage validation |

### 6.4 Logique `tryMatchCallToTask(params)` — Constantes :
- `REQUIRED_PER_CATEGORY` = 5
- `MIN_CALL_DURATION_SECONDS` = 90

**Validations successives :**
1. Feature flag enabled
2. Durée ≥ 90s
3. Poste résolvable (phone → commercial → poste, ou device → poste)
4. Catégorie résolvable (pré-résolue ou phone → Contact.client_category ou fallback JAMAIS_COMMANDE)
5. Batch actif existe
6. Idempotence : `callEventId` pas déjà utilisé dans ce batch (OBL-008)
7. Tâche PENDING de cette catégorie disponible

**Action succès :** marque tâche DONE, incrémente compteur batch, si 15 DONE → batch.status=COMPLETE

### 6.5 Contrôle qualité

- **`checkAndRecordQuality(posteId, activeConvs)`** : vérifie que le commercial a le dernier message sur CHAQUE conversation active (`last_poste_message_at ≥ last_client_message_at`)
- **Logique all-or-nothing** : une seule conversation sans réponse = KO complet

---

## 7. Écriture vers DB2

**Chemin** : `src/order-write/`

### 7.1 Table miroir (`messaging_client_dossier_mirror`)

> **Seule table que l'application écrit dans DB2.**  
> **Cette table n'est pas créée par migration DB1 — elle doit être créée manuellement en DB2.**

| Groupe | Champs |
|--------|--------|
| Mapping DB2 | `idClient` (int), `idCommercial` (int) |
| Contact messagerie | `clientMessagingContact`, `clientPhones` (JSON) |
| Dossier rapport | `clientName`, `commercialName`, `ville`, `commune`, `productCategory`, `clientNeed`, `interestScore`, `nextAction`, `followUpAt`, `notes` |
| Fermeture | `conversationResult`, `closedAt` |
| Statut sync | `syncStatus` (pending/synced/error), `syncError`, `submittedAt` |

### 7.2 Flux d'écriture (outbox)

```
ConversationReport créée (closure/dossier)
  ↓
IntegrationOutbox.enqueue(dossierPayload)
  ↓ (OutboxProcessorService cron 1min)
  ├─ Désérialise DossierMirrorPayload
  ├─ OrderDossierMirrorWriteService.upsertDossier()
  │  ├─ IntegrationSyncLogService.createPending()
  │  ├─ Résout commercialId (DB1 uuid → DB2 int via commercial_identity_mapping)
  │  ├─ Résout clientId (DB1 uuid → DB2 int via client_identity_mapping)
  │  ├─ UPSERT ON DUPLICATE KEY UPDATE (messagingChatId = clé)
  │  └─ IntegrationSyncLogService.markSuccess/markFailed()
  └─ Backoff exponentiel si échec (2^n * 60s, max 24h)
```

---

## 8. Tables de Mapping d'Identités

**Chemin** : `src/integration/entities/`

### `client_identity_mapping`

| Champ | Contrainte | Rôle |
|-------|-----------|------|
| `contact_id` | UNIQUE | FK Contact DB1 |
| `external_id` | UNIQUE | FK GicopUser.id DB2 |
| `phone_normalized` | INDEX | Pont de lookup |

**Construction du pont** : `OrderCallSyncService.syncClientMapping()` → normalise les téléphones et fait correspondre Contact DB1 ↔ GicopUser DB2 (type=client).

### `commercial_identity_mapping`

| Champ | Contrainte | Rôle |
|-------|-----------|------|
| `commercial_id` | UNIQUE | FK WhatsappCommercial DB1 |
| `external_id` | UNIQUE | FK GicopUser.id DB2 |
| `commercial_name` | — | Cache nom |

**Construction du pont** : `OrderCallSyncService.syncCommercialMapping()` → normalise les téléphones et fait correspondre WhatsappCommercial DB1 ↔ GicopUser DB2 (type=commercial, idPoste IS NOT NULL).

---

## 9. Résolution de Catégorie Client

```
appel reçu de call_logs
        │
        ├─ resolvedCategory fourni (pré-calculé) → utilisé directement
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

---

## 10. Tables DB1 — Récapitulatif Complet

| Table | Type | Clé | Migration | Rôle |
|-------|------|-----|-----------|------|
| `call_event` | Data | uuid PK | 20260424 | Copie enrichie appels DB2 |
| `call_device` | Catalog | uuid PK | 20260508 | Suivi appareils |
| `integration_sync_log` | Log | uuid PK | 20260424 | Journal sync bidirectionnel |
| `order_call_sync_cursor` | Cursor | varchar PK | 20260424 | État curseur DB2 |
| `commercial_obligation_batch` | Task | uuid PK | 20260422 | Batch obligations par poste |
| `call_task` | Task | uuid PK | 20260422 | Tâche appel (15 par batch) |
| `client_identity_mapping` | Bridge | uuid PK | 20260421 | Contact DB1 → user DB2 |
| `commercial_identity_mapping` | Bridge | uuid PK | 20260421 | Commercial DB1 → user DB2 |

## 11. Tables DB2 — Récapitulatif Complet

| Table | Accès | Entité | Rôle |
|-------|-------|--------|------|
| `commandes` | Read | `OrderCommand` | Commandes ERP |
| `statuts_commandes` | Read | `OrderCommandStatus` | Historique livraison |
| `call_logs` | Read | `OrderCallLog` | Appels téléphoniques |
| `users` | Read | `GicopUser` | Clients + commerciaux |
| `messaging_client_dossier_mirror` | **Write** | `MessagingClientDossierMirror` | Dossier-miroir |

---

## 12. Dépendances Inter-Modules

```
order-db (global)
  ├─ order-read
  │  ├─ order-segmentation-read.service
  │  └─ entités (GicopUser, OrderCommand, OrderCallLog, OrderCommandStatus)
  │
  ├─ order-call-sync
  │  ├─ call-event.service (window)
  │  ├─ call-obligations.service
  │  ├─ integration-sync-log.service
  │  ├─ call-device
  │  └─ commercial/client-identity-mapping
  │
  ├─ order-write
  │  ├─ messaging-client-dossier-mirror (écriture)
  │  ├─ integration-sync-log.service
  │  └─ commercial/client-identity-mapping
  │
  ├─ call-obligations
  │  ├─ Contact
  │  ├─ WhatsappCommercial
  │  ├─ WhatsappPoste
  │  └─ WhatsappChat (qualité)
  │
  ├─ integration-sync
  │  └─ IntegrationSyncLog (audit)
  │
  └─ gicop-report (outbox-processor)
     ├─ order-write
     └─ conversation-report
```

---

## 13. État d'Avancement des Epics

| Epic | Statut | Détail |
|------|--------|--------|
| **Epic A** — Connexion DB2 null-safe | ✅ LIVRÉ | `src/order-db/` complet, graceful degradation |
| **Epic D** — Journal sync | ✅ LIVRÉ | `src/integration-sync/`, migration présente |
| **Epic B** — Lecture commandes | ✅ LIVRÉ | Entité `OrderCommand` + `OrderCommandStatus` mappées |
| **Epic C** — Call logs + obligations | ✅ LIVRÉ | `OrderCallSyncService`, curseur, mapping, obligations câblés |
| **Table miroir DB2** | ⚠️ CODE PRÊT | La table doit être créée manuellement en DB2 par l'équipe ERP |

---

## 14. Lacunes Critiques (P0/P1)

| ID | Lacune | Impact | Fichier | Recommandation |
|----|--------|--------|---------|-----------------|
| **L-001** | Aucun timeout sur requêtes DB2 | Blocage si DB2 lente (pool 5 conn, queue 50) | `order-db.module.ts:47` | Ajouter `connectTimeout` + `statement_timeout` = 10s |
| **L-002** | Normalisation phone incohérente (`0700...` vs `+2250700...`) | Résolutions ratées silencieuses | multiples | Centraliser dans `utils/normalizePhone.ts` |
| **L-003** | Lookback 2min peut perdre appels si sync off > 2min | Appels historiques manqués définitivement | `order-call-sync.service.ts:83` | Rendre configurable, defaulter à 24h au bootstrap |
| **L-004** | Qualité batch all-or-nothing | 1 conversation sans réponse = KO complet | `call-obligation.service.ts:258` | Permettre seuil % (ex : 80% conversations OK) |
| **L-005** | Pas de vérification `ORDER_DB_AVAILABLE` avant `upsertDossier` | Throw immédiat si DB2 down | `order-dossier-mirror-write.service.ts` | Vérifier disponibilité, logger warning + skip |
| **L-006** | Catégorie obligation résolue depuis DB2 peut diverger de `Contact.client_category` | Incohérence silencieuse | `call-obligation.service.ts:189` | DB2 = source de vérité, synchroniser `client_category` |
| **L-007** | Appel sans `commercial_id` ni `device_id` rejeté définitivement | Appels perdus si résolution impossible | `order-call-sync.service.ts` | Ajouter file d'attente dédiée "non résolu" avec retry humain |
| **L-008** | Pas de réconciliation périodique des mappings | Orphelins si contact/commercial supprimé | N/A | Cron nettoyage supprime mappings dont entité DB1 absente |

---

## 15. Lacunes Modérées (P2)

| ID | Lacune | Impact | Recommandation |
|----|--------|--------|-----------------|
| **L-009** | Pas de partitioning sur `call_event` | Croissance non bornée | Partitionner par `MONTH(event_at)` |
| **L-010** | `purgeOldSuccess` non déclenchée automatiquement | `integration_sync_log` croît sans TTL | Ajouter cron hebdomadaire |
| **L-011** | Pas d'alerte si batch jamais `READY` | Manager non notifié en cas de blocage | Webhook/email si `qualityCheckPassed=false` depuis N jours |
| **L-012** | `commercial_identity_mapping` non refreshé si phone change | Mapping out-of-sync | Ajouter UPDATE si external_id déjà existant avec phone différent |
| **L-013** | Aucun test d'intégration DB2 | Risque de cassage si schéma DB2 change | Ajouter fixture DB2 local / CI |
| **L-014** | Recalcul device counts via SQL raw | Non typesafe | Migrer vers QueryBuilder TypeORM |
| **L-015** | `BATCH_SIZE` statique (200) | Pics possibles aux heures pleines | Paramétrer via env + adapter selon queue length |
| **L-016** | `isBusinessRejection` jamais exploité dans les dashboards | Faux positifs dans monitoring | Filtrer les rejets métier des alertes erreur technique |

---

## 16. Problèmes de Design

### Architectural

| Problème | Sévérité | Détail | Fix proposé |
|----------|----------|--------|------------|
| Curseur scope `'global'` unique | Moyen | Pas de partition par commercial/device | Permettre curseurs par poste (scale horizontale) |
| Risque doublon `call_event` | Moyen | `external_id` unique mais pas de contrainte composite | Ajouter index unique sur `(device_id, remote_number, call_timestamp)` |
| Cardinalité `integration_sync_log` | Moyen | Toutes entités mélangées → joins coûteux | Splitter en tables spécialisées (`sync_log_calls`, `sync_log_dossiers`) |
| `OrderCallSyncService` trop chargée | Bas | ~520 lignes, viole SRP | Extraire obligation matching en service dédié |

### Data Quality

| Problème | Sévérité | Détail | Fix proposé |
|----------|----------|--------|------------|
| Normalisation phone | Haut | Pas de validateur uniforme | Créer `PhoneVO` (Value Object) + normalizer centralisé |
| Mapping orphelins | Moyen | Contact supprimé en DB1, mapping reste | Ajouter FK optionnelle ou cleanup cron |
| NULL ambiguïté | Moyen | `idClient=NULL` ≠ "pas mappé" | Ajouter champ `mappingStatus` enum |
| Ambiguïté timestamps | Moyen | `callTimestamp` vs `receivedAt` vs `event_at` vs `created_at` | Normaliser : `event_at` = authority, `received_at` = latence ingestion |

---

## 17. Points Critiques à Tester

1. **Tie-breaker curseur** : appels même timestamp → pas de doublon ni de perte
2. **Idempotence `call_event`** : `external_id` déjà existant → INSERT IGNORE correct
3. **Résolution en cascade** : phone absent → fallback device → fallback category JAMAIS_COMMANDE
4. **Transition batch** : 15 tâches DONE → `status=COMPLETE` atomique
5. **Quality check** : comparaison `last_poste_message_at ≥ last_client_message_at` (fuseaux horaires ?)
6. **Backfill device** : historique sans `device_id` → auto-découverte correcte
7. **Backoff outbox** : exponentiel `2^n * 60s` respecté sur 24h max
8. **DB2 unavailable** : graceful degradation, pas de crash application

---

## 18. Points de Risque Opérationnels

| ID | Risque | Impact | Mitigation actuelle |
|----|--------|--------|---------------------|
| **R1** | `remote_number` inconnu de DB2 → fallback JAMAIS_COMMANDE | Fausse statistique obligations | Mitigation partielle si `id_client` présent dans `call_logs` |
| **R2** | Table `messaging_client_dossier_mirror` absente en DB2 | Outbox accumule erreurs (backoff 24h) | Alerte `OutboxAlertService` si ≥ 5 entrées failed |
| **R3** | Race condition `syncCommercialMapping` vs batch | Double écriture mapping | Lock Redlock TTL 450s entre instances |
| **R4** | Drift curseur (insertions tardives DB2) | Appels manqués définitivement | Lookback 2min (insuffisant — voir L-003) |
| **R5** | `ReportClosureMirrorListener` double-écriture | 2 upserts inutiles en DB2 | Idempotent (ON DUPLICATE KEY UPDATE) |

---

## 19. Axes d'Amélioration Prioritaires

### Sprint immédiat (P0)
- [ ] **L-001** — Ajouter timeouts DB2 (`connectTimeout=10s`, `statement_timeout=10s`)
- [ ] **L-002** — Centraliser normalisation phone dans `utils/normalizePhone.ts`
- [ ] **L-005** — Vérifier `ORDER_DB_AVAILABLE` avant `upsertDossier`
- [ ] **L-003** — Lookback configurable (défaut 24h au bootstrap)

### Sprint suivant (P1)
- [ ] **L-006** — Synchroniser `Contact.client_category` depuis DB2 (source de vérité)
- [ ] **L-007** — File d'attente "appels non résolus" avec retry humain
- [ ] **L-008** — Cron nettoyage mapping orphelins
- [ ] **L-013** — Tests d'intégration DB2 sur fixture locale

### Backlog (P2)
- [ ] **L-004** — Seuil qualité batch (80% au lieu de 100%)
- [ ] **L-010** — Cron `purgeOldSuccess` hebdomadaire
- [ ] **L-011** — Alerting escalade si batch bloqué
- [ ] **L-009** — Partitioning `call_event` par mois

---

*Rapport généré le 2026-05-09 — base d'audit pour le sprint de raffinage synchronisation DB1/DB2.*
