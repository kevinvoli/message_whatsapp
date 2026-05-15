# Rapport d'Analyse — Attribution des Appels Téléphoniques

**Date d'analyse :** 2026-05-15
**Auteur :** Analyse automatique du code source
**Périmètre :** Attribution des appels téléphoniques aux commerciaux (sync DB2 → DB1)
**Modules analysés :**
- `src/order-call-sync/` — pipeline principal de synchronisation
- `src/call-obligations/` — matching obligation GICOP
- `src/missed-calls/` — gestion des appels en absence
- `src/window/services/call-event.service.ts` — ingestion call_event
- `src/call-device/` — annuaire des appareils
- `src/order-read/` — entités read-only DB2
- `src/commercial-group/` — groupes commerciaux
- `src/work-schedule/` — plannings de groupe

---

## 1. Vue d'ensemble

Le système d'attribution des appels téléphoniques repose sur un pipeline de synchronisation continue entre la base de données de la plateforme commande (DB2, en lecture seule) et la base de données principale de la messagerie (DB1). Son objectif est triple :

1. **Tracer** chaque appel téléphonique émis ou reçu par les commerciaux dans DB1 (table `call_event` et `call_log`).
2. **Attribuer** chaque appel à un commercial DB1 identifié (UUID), en utilisant deux pivots possibles : le numéro de téléphone SIM (`local_number`) ou l'identifiant matériel du téléphone (`device_id`).
3. **Valider** les obligations d'appels GICOP (5 appels par catégorie de client : annulé, livré, jamais commandé) par poste de travail, afin de débloquer la rotation de la fenêtre glissante de conversations.

Le pipeline est orchestré par `OrderCallSyncJob` (`src/order-call-sync/order-call-sync.job.ts`) qui tourne en cron toutes les 30 secondes et délègue le travail à `OrderCallSyncService` (`src/order-call-sync/order-call-sync.service.ts`).

### Flux général

```
DB2 (call_logs, users, commandes, statuts_commandes)
    ↓ lecture seule — ORDER_DB_DATA_SOURCE
OrderCallSyncService.syncNewCalls()
    ↓
    ├── Résolution commercial (device_id ou local_number)
    ├── CallEventService.ingestFromDb2() → call_event (DB1)
    ├── CallLogRepo.save()               → call_log (DB1)
    ├── MissedCallHandlerService.handle() → missed_call_event (DB1)
    └── CallObligationService.tryMatchCallToTask() → call_task (DB1)
```

---

## 2. Architecture — Entités de données

### 2.1 `OrderCallLog` — Table `call_logs` (DB2, lecture seule)

**Fichier :** `src/order-read/entities/order-call-log.entity.ts`
**Base :** DB2 — jamais d'écriture possible

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `varchar(36)` | Clé primaire — utilisée comme `external_id` dans DB1 |
| `device_id` | `varchar(100)` | Identifiant matériel du téléphone (pivot principal) |
| `call_type` | `varchar(20)` | Type d'appel : `missed`, `outgoing`, `answered`, `rejected`... |
| `local_number` | `varchar(30)` | Numéro SIM du commercial (pivot secondaire) |
| `remote_number` | `varchar(30)` | Numéro du client appelé |
| `duration` | `int` | Durée en secondes (peut être en millisecondes — voir normalisation) |
| `call_timestamp` | `datetime` | Horodatage de l'appel |
| `device_id` | `varchar(100)` | Identifiant matériel (même valeur que `GicopUser.deviceId`) |

**Constantes clés :**
- `ORDER_CALL_TYPE_MISSED = 'missed'` — appel entrant non décroché
- `ORDER_CALL_TYPE_OUTGOING = 'outgoing'` — seul type éligible aux obligations GICOP
- `ORDER_CALL_MIN_DURATION_SEC = 90` — durée minimale déclarée (mais `skipDurationCheck: true` est passé partout en pratique)

**Note importante :** La colonne `call_type` provient de DB2 en majuscules (`OUTGOING`, `MISSED`) mais le service normalise via `.toLowerCase()` avant tout traitement. Une migration dédiée (`20260509_normalize_call_status_lowercase.ts`) corrige les données historiques dans `call_event`.

---

### 2.2 `CallEvent` — Table `call_event` (DB1)

**Fichier :** `src/window/entities/call-event.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `uuid` | Clé primaire DB1 |
| `external_id` | `varchar(100)` | ID de l'appel dans DB2 — index UNIQUE |
| `commercial_phone` | `varchar(50)` | Numéro SIM du commercial (dénormalisé) |
| `commercial_id` | `char(36)` | UUID du commercial DB1 (nullable si non résolu) |
| `attribution_source` | `varchar(20)` | `'device_poste'` ou `'phone'` — trace la méthode d'attribution |
| `device_id` | `varchar(64)` | ID matériel du téléphone (nullable si appel avant migration) |
| `client_phone` | `varchar(50)` | Numéro du client |
| `call_status` | `varchar(30)` | Statut normalisé en minuscules |
| `duration_seconds` | `int` | Durée normalisée en secondes |
| `event_at` | `timestamp` | Horodatage de l'appel |

**Index :**
- `UQ_call_event_external_id` — unicité sur `external_id` (idempotence INSERT IGNORE)
- `IDX_call_event_device_ts` — `(device_id, client_phone, event_at)` — diagnostic

**Enum `CallStatus` dans cette entité :** `answered`, `no_answer`, `busy`, `rejected`, `failed`, `voicemail`. Attention : les valeurs réelles stockées incluent aussi `outgoing`, `missed` qui viennent de DB2 et ne correspondent pas à l'enum TypeScript (l'entité utilise `varchar` pour `call_status`, pas un vrai enum SQL).

---

### 2.3 `CallDevice` — Table `call_device` (DB1)

**Fichier :** `src/call-device/entities/call-device.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `deviceId` | `varchar(64)` UNIQUE | Identifiant matériel — découvert automatiquement lors de la sync |
| `label` | `varchar(128)` | Libellé libre assigné manuellement par l'admin |
| `posteId` | `varchar(64)` | UUID du poste DB1 associé manuellement par l'admin |
| `firstSeen` | `datetime` | Premier appel observé pour ce device |
| `lastSeen` | `datetime` | Dernier appel observé |
| `callCount` | `int` | Nombre total d'appels (recalculé depuis DB2) |

**Rôle critique :** C'est la table pivot entre le monde physique (téléphone identifié par `device_id`) et le monde logique (poste de travail DB1). L'association `device_id → posteId` est manuelle : l'administrateur doit la configurer via l'API `CallDeviceController`. Sans cette association, la résolution commerciale par device ne peut pas aboutir.

---

### 2.4 `CallTask` — Table `call_task` (DB1)

**Fichier :** `src/call-obligations/entities/call-task.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `uuid` | Clé primaire |
| `batchId` | `char(36)` | FK vers `commercial_obligation_batch` |
| `posteId` | `char(36)` | Poste cible (dénormalisé) |
| `category` | `enum` | `commande_annulee`, `commande_avec_livraison`, `jamais_commande` |
| `status` | `enum` | `pending`, `done` |
| `clientPhone` | `varchar(50)` | Numéro du client ayant validé la tâche |
| `callEventId` | `varchar(100)` | `external_id` de l'appel dans call_event |
| `durationSeconds` | `int` | Durée de l'appel validant |
| `completedAt` | `timestamp` | Date de validation |

**Index :** `IDX_call_task_batch_cat` sur `(batch_id, category, status)` — utilisé pour la recherche rapide de la prochaine tâche disponible.

---

### 2.5 `CommercialObligationBatch` — Table `commercial_obligation_batch` (DB1)

**Fichier :** `src/call-obligations/entities/commercial-obligation-batch.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | `uuid` | Clé primaire |
| `posteId` | `char(36)` | Poste de travail cible |
| `batchNumber` | `int` | Numéro séquentiel (1, 2, 3...) |
| `status` | `enum` | `pending` (en cours) ou `complete` (5/5/5 atteints) |
| `annuleeDone` | `int` | Compteur catégorie annulée (objectif : 5) |
| `livreeDone` | `int` | Compteur catégorie livrée (objectif : 5) |
| `sansCommandeDone` | `int` | Compteur catégorie sans commande (objectif : 5) |
| `qualityCheckPassed` | `boolean` | Résultat du dernier contrôle qualité messages |
| `completedAt` | `timestamp` | Date de complétion du batch |

**Règle :** Un batch est considéré complet (`COMPLETE`) quand les 3 compteurs atteignent chacun 5. La rotation de la fenêtre glissante est bloquée tant que le batch n'est pas complet ET que les rapports de conversation ne sont pas tous soumis.

---

### 2.6 `CallEventUnresolved` — Table `call_event_unresolved` (DB1)

**Fichier :** `src/order-call-sync/entities/call-event-unresolved.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `externalId` | `varchar(100)` UNIQUE | ID appel DB2 |
| `localNumber` | `varchar(30)` | Numéro SIM du commercial (si connu) |
| `remoteNumber` | `varchar(30)` | Numéro du client |
| `deviceId` | `varchar(100)` | ID matériel (si connu) |
| `reason` | `varchar(200)` | Cause : `commercial_not_found`, `db2_unavailable` |
| `resolvedAt` | `datetime` | Null si toujours non résolu |

**Rôle :** File d'attente des appels pour lesquels aucun commercial DB1 n'a pu être identifié. Permet un retry manuel via l'API admin.

---

### 2.7 `OrderCallSyncCursor` — Table `order_call_sync_cursor` (DB1)

**Fichier :** `src/order-call-sync/entities/order-call-sync-cursor.entity.ts`

| Colonne | Rôle |
|---|---|
| `scope` | Clé primaire (`'global'`) |
| `lastCallTimestamp` | Timestamp du dernier appel traité — borne inférieure de la prochaine requête DB2 |
| `lastCallId` | ID du dernier appel (tie-breaker) |
| `processedCount` | Compteur cumulatif de tous les appels traités |

---

### 2.8 `MissedCallEvent` — Table `missed_call_event` (DB1)

**Fichier :** `src/missed-calls/entities/missed-call-event.entity.ts`

| Colonne | Type | Rôle |
|---|---|---|
| `source` | `enum` | `'whatsapp'` ou `'db2'` — origine de la détection |
| `externalId` | `varchar(100)` UNIQUE | ID appel dans la source |
| `clientPhone` | `varchar(50)` | Numéro du client (normalisé) |
| `posteId` | `varchar(36)` | Poste associé (nullable) |
| `commercialId` | `varchar(36)` | Commercial assigné (nullable) |
| `callbackTaskId` | `varchar(36)` | FK vers `commercial_action_task` (tâche de rappel) |
| `status` | `enum` | `pending`, `assigned`, `called_back`, `escalated`, `closed` |
| `slaBreachedAt` | `timestamp` | Date de dépassement du SLA (30 min par défaut) |
| `handlingDelaySeconds` | `int` | Délai entre l'appel manqué et le rappel effectif |

---

### 2.9 `GicopUser` — Table `users` (DB2, lecture seule)

**Fichier :** `src/order-read/entities/giocop-user.entity.ts`

Contient à la fois les clients (type=0) et les commerciaux (type=1). Le pont avec DB1 se fait via le numéro de téléphone.

- `GIOCOP_USER_TYPE_COMMERCIAL = 1`
- `GIOCOP_USER_TYPE_CLIENT = 0`

**Note :** La colonne `deviceId` de `GicopUser` contient le même identifiant matériel que `call_logs.device_id`. Ce champ est disponible mais n'est PAS utilisé dans le pipeline de résolution actuel — seul `call_logs.device_id` est utilisé comme pivot.

---

### 2.10 `OrderCommand` / `OrderCommandStatus` — Tables `commandes` / `statuts_commandes` (DB2)

**Fichiers :** `src/order-read/entities/order-command.entity.ts` / `src/order-read/entities/order-command-status.entity.ts`

Utilisées uniquement pour résoudre la catégorie client dans `resolveCategoryByClientId()`.

Codes `etat` de `statuts_commandes` interprétés comme retour : `[2, 4, 99]` (définis dans `ORDER_COMMAND_STATUS_ETAT_RETOUR`).

---

### 2.11 `CallLog` — Table `call_log` (DB1)

**Fichier :** `src/call-log/entities/call_log.entity.ts`

Journal enrichi des appels — créé automatiquement pour chaque appel DB2 pour lequel un commercial a été résolu. Lien avec `call_event` via `callEventExternalId` (index unique).

| Colonne | Rôle |
|---|---|
| `contact_id` | FK vers Contact (nullable si client sans compte WhatsApp) |
| `poste_id` | Poste du commercial au moment de l'appel |
| `commercial_id` | UUID du commercial |
| `call_status` | Enum `CallStatus` (à_appeler, appelé, rappeler, non_joignable) |
| `outcome` | Enum `CallOutcome` (répondu, messagerie, pas_de_réponse, occupé) |
| `callEventExternalId` | Lien idempotent avec call_event |

---

### 2.12 `CommercialIdentityMapping` / `ClientIdentityMapping` (DB1)

Tables de correspondance entre les UUIDs DB1 et les IDs entiers DB2 :
- `commercial_identity_mapping` : `commercial_id` (UUID) ↔ `external_id` (int DB2)
- `client_identity_mapping` : `contact_id` (UUID) ↔ `external_id` (int DB2) + `phone_normalized`

Ces tables ne sont pas utilisées dans le flux temps-réel de résolution des appels (qui passe directement par le téléphone), mais sont synchronisées par `syncCommercialMapping()` et `syncClientMapping()` pour d'autres usages potentiels.

---

## 3. Pipeline de synchronisation (DB2 → DB1)

### 3.1 Déclenchement

**Fichier :** `src/order-call-sync/order-call-sync.job.ts`, méthode `_run()`

Le job `OrderCallSyncJob` s'exécute selon deux modalités :
- **Bootstrap :** au démarrage de l'application (`onApplicationBootstrap`), lancement immédiat de `_run()`, `_runSyncClientCategories()` et `_runInitBatches()` en parallèle (via `setImmediate` pour les deux derniers).
- **Cron 30s :** méthode `run()` décorée `@Cron('*/30 * * * * *')`.

Le cron dispose d'un **verrou distribué Redis** (`DistributedLockService`) avec une durée de 29 secondes (légèrement inférieure à la période du cron pour éviter les chevauchements). Un flag en mémoire `this.running` assure une protection supplémentaire en cas de Redis indisponible.

Séquence dans `_run()` :
1. `syncCommercialMapping()` — synchronise `commercial_identity_mapping`
2. `syncClientMapping()` — synchronise `client_identity_mapping`
3. `syncNewCalls()` — pipeline principal d'ingestion des appels

---

### 3.2 Étape 1 — Lecture du curseur et fenêtre temporelle

**Méthode :** `syncNewCalls()` dans `OrderCallSyncService`

Le service récupère ou crée le curseur global via `getOrCreateCursor()`. Le curseur stocke `lastCallTimestamp` — le timestamp du dernier appel traité.

La requête DB2 utilise une fenêtre lookback pour éviter de rater des appels insérés avec un léger retard :

```
since = cursor.lastCallTimestamp (ou epoch 0 si premier run)
lookbackSince = since - CURSOR_LOOKBACK_MINUTES (défaut : 2 min, configurable via ORDER_CALL_SYNC_LOOKBACK_MINUTES)
```

La requête sur `call_logs` :
```
WHERE call_timestamp >= lookbackSince
ORDER BY call_timestamp ASC, id ASC
LIMIT batchSize (défaut : 200, configurable via ORDER_CALL_SYNC_BATCH_SIZE)
```

**Note :** La lookback window de 2 minutes signifie que les appels des 2 dernières minutes sont **relus à chaque cycle**. L'idempotence est assurée côté DB1 par l'index UNIQUE sur `call_event.external_id` (INSERT IGNORE) et par la vérification `existsAnyForEntity` dans `integration_sync_log` pour le traitement des obligations.

---

### 3.3 Étape 2 — Pré-résolution en batch (avant la boucle)

Pour éviter des requêtes N+1, deux maps sont pré-calculées avant la boucle principale :

**Map 1 — Résolution par numéro de téléphone :**
- Charge tous les commerciaux DB1 non supprimés avec leur numéro de téléphone
- Construit `commercialByPhone : Map<normalizedPhone, commercialId>`
- Normalisation via `normalizePhone()` (suppression des espaces, indicatifs...)

**Map 2 — Résolution par device_id :**
- Charge tous les `CallDevice` ayant un `posteId` non null
- Charge les commerciaux assignés à ces postes (avec relations `poste`, `isWorkingToday`, `groupId`, `lastConnectionAt`)
- Construit `poolByPosteId : Map<posteId, WhatsappCommercial[]>` — supporte plusieurs commerciaux par poste

**Backfill device_id en début de cycle :**
La méthode `backfillNullDeviceIds()` est appelée systématiquement avant la boucle. Elle lit les `external_id` de `call_event` sans `device_id` (limite 500), retrouve les `device_id` correspondants dans DB2, et les applique en batch via `applyDeviceIdBatch()`.

---

### 3.4 Étape 3 — Traitement de chaque appel (boucle principale)

Pour chaque `OrderCallLog` récupéré :

#### 3.4.A Résolution du commercial

Voir section 4 pour le détail de la cascade.

#### 3.4.B Marquage is_working_today

Si un commercial est résolu et qu'il n'a pas encore été marqué dans ce cycle, le service exécute :
```typescript
commercialRepo.update(commercialIdDb1, {
  isWorkingToday: true,
  workingTodaySince: new Date(),
})
```
Un `Set<string>` (`workingTodayIds`) évite les mises à jour redondantes dans le même cycle.

#### 3.4.C Ingestion dans call_event

`CallEventService.ingestFromDb2()` est toujours appelé, que le commercial soit résolu ou non. Il exécute :
1. `INSERT IGNORE` dans `call_event` (idempotent via index UNIQUE sur `external_id`)
2. Si `commercialId` fourni et ligne déjà présente sans `commercial_id` → UPDATE de `commercial_id` (backfill)
3. Si `deviceId` fourni et ligne déjà présente sans `device_id` → UPDATE de `device_id` (backfill)

#### 3.4.D Création du call_log

Uniquement si `commercialIdDb1 !== null`. Vérification préalable d'idempotence via `callLogRepo.findOne({ where: { callEventExternalId: String(call.id) } })`.

Résout le contact client via `contactRepo.findOne({ where: { phone: normalizePhone(remoteNumber) } })`.

Mapping `callType → CallStatus/CallOutcome` :
| `callType` | `CallStatus` | `CallOutcome` |
|---|---|---|
| `answered` | `Appelé` | `Répondu` |
| `outgoing` + durée > 0 | `Appelé` | `Répondu` |
| `outgoing` + durée = 0 | `Non_Joignable` | `PasDeRéponse` |
| `no_answer` ou `missed` | `Non_Joignable` | `PasDeRéponse` |
| `busy` | `Non_Joignable` | `Occupé` |
| `voicemail` | `Rappeler` | `Messagerie` |
| tout autre | `Non_Joignable` | `PasDeRéponse` |

#### 3.4.E Auto-découverte du device

Si `call.deviceId` est présent, `upsertCallDevice()` crée ou met à jour l'entrée dans `call_device` (uniquement `lastSeen` si déjà existant). L'erreur est silencieuse (catch vide) pour ne pas bloquer la sync.

#### 3.4.F Gestion des appels non résolus

Si `commercialIdDb1 === null` après toutes les tentatives, l'appel est inséré dans `call_event_unresolved` via `INSERT IGNORE` (idempotent). La raison stockée est `'commercial_not_found'`.

#### 3.4.G Gestion des appels manqués (missed)

Si `callType === 'missed'` ET `missedCallHandlerService` est disponible, la méthode `handle()` est appelée en fire-and-forget (`.catch()` en cas d'erreur). Le `posteId` est résolu via `allDevices` (device → posteId).

#### 3.4.H Éligibilité aux obligations GICOP et skip rappel

`isEligibleForObligation()` vérifie :
- `callType === 'outgoing'`
- Et (`localNumber` non vide OU `deviceId` non vide)

Si éligible, avant le matching d'obligation, le service vérifie si cet appel sortant est un **rappel d'un appel en absence** via `missedCallHandlerService.onOutgoingCallDetected()`. Si oui, il est marqué `MISSED_CALL_CALLBACK` et **skippé** pour le matching GICOP.

#### 3.4.I Matching de l'obligation GICOP

Appel à `matchObligation()` → `CallObligationService.tryMatchCallToTask()`. Voir section 5.

---

### 3.5 Mise à jour du curseur

Après la boucle, le curseur est mis à jour avec le timestamp et l'ID du dernier appel traité :
```typescript
cursorRepo.update({ scope: CURSOR_SCOPE }, {
  lastCallTimestamp: last.callTimestamp,
  lastCallId:        last.id,
  processedCount:    () => `processed_count + ${newCalls}`,
})
```

En parallèle, `recalculateDeviceCounts()` recalcule les `call_count` de chaque device depuis DB2.

---

## 4. Résolution du commercial responsable

### 4.1 Architecture de la résolution

La résolution se fait en **deux niveaux** dans `syncNewCalls()` :

**Niveau 1 — device_id (priorité haute) :**
Si `call.deviceId` est présent et qu'un `CallDevice` avec ce `deviceId` existe ET a un `posteId`, on entre dans la cascade `resolveCommercialForDevice()`.

**Niveau 2 — local_number (fallback) :**
Si le niveau 1 échoue (pas de device_id, ou device sans poste, ou cascade renvoie null), on cherche dans la map pré-calculée `commercialByPhone` via `normalizePhone(call.localNumber)`.

Si les deux niveaux échouent → `commercialIdDb1 = null`, l'appel va dans `call_event_unresolved`.

### 4.2 Cascade `resolveCommercialForDevice()` — 4 étapes

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`, méthode privée `resolveCommercialForDevice(pool, localNumber, callTimestamp, scheduleCache)`

La méthode prend en entrée un pool de commerciaux potentiels (tous assignés au même poste via `call_device → posteId`).

**Étape 1 — Groupe planifié à l'heure de l'appel**
- Résout les groupes actifs à l'instant `callTimestamp` via `WorkScheduleService.getActiveGroupIds(callTimestamp)`
- Filtre le pool aux commerciaux dont le `groupId` est dans les groupes actifs
- Si filtre vide → on garde le pool entier (dégradé)
- Si résultat = 1 commercial → retourné immédiatement

Un cache en mémoire (`scheduleCache : Map<string, string[]>`) évite les appels répétés à `getActiveGroupIds` pour le même slot horaire dans un même cycle de 200 appels.

**Étape 2 — is_working_today**
- Filtre les commerciaux qui ont `isWorkingToday = true`
- Si filtre vide → on garde le résultat de l'étape 1 (dégradé)
- Si résultat = 1 commercial → retourné immédiatement

**Étape 3 — Tiebreaker local_number**
- Si `localNumber` est fourni, cherche dans le pool un commercial dont `normalizePhone(phone) === normalizePhone(localNumber)`
- Si trouvé → retourné immédiatement

**Étape 4 — Dernier connecté**
- Tri du pool restant par `lastConnectionAt` décroissant
- Retourne le premier (dernier connecté)
- Si pool vide → retourne null

### 4.3 Attribution par numéro de téléphone (fallback global)

Utilise la map `commercialByPhone` pré-calculée. La normalisation via `normalizePhone()` est appliquée des deux côtés. Source d'attribution : `'phone'`.

### 4.4 Traçabilité de l'attribution

Le champ `attribution_source` de `call_event` trace la méthode utilisée :
- `'device_poste'` — résolution via device_id → poste → cascade pool
- `'phone'` — résolution via local_number → commercial.phone
- `null` — commercial non résolu (mais call_event créé quand même)

---

## 5. Attribution à une tâche obligation

### 5.1 Condition d'éligibilité préalable

Dans `syncNewCalls()`, `isEligibleForObligation()` vérifie :
- `callType === 'outgoing'`
- `localNumber` non vide OU `deviceId` non vide (au moins un identifiant commercial)

### 5.2 Flux dans `matchObligation()`

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

1. Si `obligationService` non injecté → retourne `null` (service optionnel)
2. Si `orderDb` null (DB2 indisponible) → insère dans `call_event_unresolved` avec raison `'db2_unavailable'` et retourne `{ matched: false, reason: 'db2_unavailable' }`
3. Résout la catégorie client via `resolveClientCategory(call.remoteNumber)` (voir section 6)
4. Résout le `posteId` via `device_id → callDeviceRepo` (fallback D7)
5. Appelle `CallObligationService.tryMatchCallToTask()`

### 5.3 Méthode `tryMatchCallToTask()`

**Fichier :** `src/call-obligations/call-obligation.service.ts`

**Paramètres :**
```typescript
{
  callEventId: string;          // external_id de l'appel
  durationSeconds: number | null;
  resolvedCategory?: CallTaskCategory | null;  // catégorie pré-résolue depuis DB2
  clientPhone?: string;
  commercialPhone?: string;
  posteId?: string | null;
  skipDurationCheck?: boolean;  // toujours true en pratique
}
```

**Conditions de rejet (toutes loggées) :**

| Condition | Raison retournée |
|---|---|
| Feature flag `FF_CALL_OBLIGATIONS_ENABLED` = false | `feature_disabled` |
| Durée < 90s ET `skipDurationCheck` = false | `duree_insuffisante` |
| Pas de poste résolu (ni via param, ni via `resolvePosteByCommercialPhone`) | `poste_introuvable` |
| Aucun batch en statut `PENDING` pour ce poste | `aucun_batch_actif` |
| `callEventId` déjà utilisé dans ce batch | `appel_deja_traite` |
| Quota de la catégorie atteint (5/5) | `quota_categorie_atteint` |

**Si toutes les conditions passent :**
1. La `CallTask` ciblée passe en statut `DONE` avec `clientPhone`, `callEventId`, `durationSeconds`, `completedAt`
2. Le compteur correspondant dans `CommercialObligationBatch` est incrémenté
3. Si tous les compteurs atteignent 5 → batch passe en `COMPLETE`
4. Émission de l'événement `call_obligation.matched` via `EventEmitter2`
5. Log `CALL_OBLIGATION_MATCHED` avec tous les détails

**Résolution du poste si non fourni :**
`resolvePosteByCommercialPhone(phone)` cherche le commercial par `phone` normalisé, charge sa relation `poste` et retourne `poste.id`. C'est le fallback si `posteId` n'a pas pu être résolu en amont.

**Résolution de la catégorie si non fournie :**
`resolveContactCategory(clientPhone)` cherche le `Contact` DB1 par numéro normalisé et lit son champ `client_category`. Mapping via `CATEGORY_MAP` :
- `ClientCategory.COMMANDE_ANNULEE` → `CallTaskCategory.COMMANDE_ANNULEE`
- `ClientCategory.COMMANDE_AVEC_LIVRAISON` → `CallTaskCategory.COMMANDE_AVEC_LIVRAISON`
- `ClientCategory.JAMAIS_COMMANDE` → `CallTaskCategory.JAMAIS_COMMANDE`
- `ClientCategory.COMMANDE_SANS_LIVRAISON` → `CallTaskCategory.JAMAIS_COMMANDE` (fusion)

Si aucune catégorie trouvée → défaut `CallTaskCategory.JAMAIS_COMMANDE`.

---

## 6. Résolution de la catégorie client (DB2)

### 6.1 Point d'entrée : `resolveClientCategory(remoteNumber)`

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

Algorithme :
1. Normalise `remoteNumber` via `normalizePhone()`
2. Cherche dans DB2 (`GicopUser`) le client par téléphone (champs `phone` ou `phone2`) avec `type = CLIENT (0)` et `valid = 1`
3. Si non trouvé → retourne `CallTaskCategory.JAMAIS_COMMANDE` (défaut conservateur)
4. Si trouvé → appelle `resolveCategoryByClientId(clientIdDb2, orderDb)`
5. **Upsert du Contact DB1** : met à jour `client_category` et `order_client_id` si le contact existe ; sinon crée un contact `ErpImport` avec `conversion_status = 'client'`

### 6.2 Méthode `resolveCategoryByClientId()` — Règles métier

**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

Charge toutes les commandes `valid = 1` du client (table `commandes`).

| Situation | Catégorie retournée |
|---|---|
| Aucune commande | `JAMAIS_COMMANDE` |
| Au moins une commande avec `dateLivree IS NOT NULL` ET `trueCancel != 1` | `COMMANDE_AVEC_LIVRAISON` |
| Pas de livraison + dernière commande `trueCancel = 1` | `COMMANDE_ANNULEE` |
| Pas de livraison + dernier statut commande dans `[2, 4, 99]` | `COMMANDE_ANNULEE` |
| Tout autre cas (commande en cours non livrée, non annulée) | `JAMAIS_COMMANDE` |

**Note importante :** Une commande en cours (non livrée, non annulée) est traitée comme `JAMAIS_COMMANDE` par règle métier. C'est un choix délibéré : tant que la livraison n'est pas effective, le client est considéré comme "jamais commandé" pour les obligations d'appels.

### 6.3 Synchronisation périodique des catégories

**Méthode :** `syncClientCategories()` — cron quotidien à 2h

Parcourt tous les contacts DB1 avec un numéro de téléphone et recalcule leur catégorie depuis DB2. Permet de corriger les catégories obsolètes (ex : client passé de `JAMAIS_COMMANDE` à `COMMANDE_AVEC_LIVRAISON` après une livraison).

---

## 7. Jobs et crons

### 7.1 `OrderCallSyncJob` — Orchestrateur principal

**Fichier :** `src/order-call-sync/order-call-sync.job.ts`

| Méthode | Schedule | Rôle |
|---|---|---|
| `run()` | `*/30 * * * * *` (toutes les 30s) | Sync principale DB2 → DB1 |
| `retryObligations()` | `0 */5 * * * *` (toutes les 5min) | Retry des obligations non matchées |
| `syncClientCategories()` | `0 2 * * *` (quotidien à 2h) | Resync des catégories clients depuis DB2 |
| `cleanOrphans()` | `0 3 * * 0` (dimanche à 3h) | Suppression des mappings orphelins |
| `purgeOldSyncLogs()` | `0 4 * * 0` (dimanche à 4h) | Purge des logs `integration_sync_log` > 30j |

**Séquence complète de `_run()` :**
1. `syncCommercialMapping()` — sync identités commerciaux
2. `syncClientMapping()` — sync identités clients
3. `syncNewCalls()` — pipeline principal (retourne `{ processed, obligations, errors }`)

**Bootstrap :** En plus du cron, trois opérations sont lancées immédiatement au démarrage :
- `_run('bootstrap')` — sync initiale synchrone
- `_runSyncClientCategories()` — via `setImmediate` (asynchrone, non bloquant)
- `_runInitBatches()` — via `setImmediate` (asynchrone, non bloquant)

---

### 7.2 `retryUnmatchedObligations()` — Mécanisme de retry

**Méthode :** `OrderCallSyncService.retryUnmatchedObligations()`, déclenchée par le cron de 5 min.

Candidats éligibles (via `CallEventService.findEligibleForRetry()`) :
- `call_status = 'outgoing'`
- `duration_seconds >= 0` (aucun filtre de durée)
- `commercial_id IS NOT NULL OR device_id IS NOT NULL`
- Aucune entrée `success` dans `integration_sync_log` pour ce `callEventId`

Pour chaque candidat :
1. Résolution du `posteId` :
   - Via `commercial_id → WhatsappCommercial → poste` (résolution 1)
   - Via `device_id → call_device → posteId` (résolution 2, fallback)
2. Si aucun poste → skip (réessayé au prochain cycle)
3. Résolution de la catégorie depuis DB2 via `resolveClientCategory()`
4. Appel à `tryMatchCallToTask()` avec le résultat

Limite : 100 candidats par cycle de retry.

---

### 7.3 `ObligationQualityCheckJob` — Contrôle qualité

**Fichier :** `src/call-obligations/obligation-quality-check.job.ts`

Enregistré via `CronConfigService.registerHandler('obligation-quality-check', ...)` — la périodicité est configurable depuis l'admin (table `cron_config`).

Pour chaque poste avec un batch actif :
1. Charge les conversations actives du bloc (`getActiveBlockConversations()`) : conversations avec `window_status = ACTIVE` et `window_slot IS NOT NULL`
2. Vérifie que le commercial a répondu au dernier message de chaque conversation (`last_poste_message_at >= last_client_message_at`)
3. Calcule le pourcentage de conversations OK — seuil configurable via `CALL_QUALITY_THRESHOLD_PCT` (défaut 80%)
4. Persiste le résultat dans `CommercialObligationBatch.qualityCheckPassed`

**Alerting batches bloqués (N10) :**
Après chaque contrôle, `alertStuckBatches()` détecte les batches `PENDING` créés il y a plus de 3 jours. Une alerte notification est émise via `NotificationService`, avec anti-doublon en mémoire (1 alerte / 24h par batch). L'anti-doublon est **réinitialisé au redémarrage** du processus.

---

### 7.4 `MissedCallSlaJob` — Gestion SLA des appels manqués

**Fichier :** `src/missed-calls/missed-call-sla.job.ts`

Enregistré via `CronConfigService.registerHandler('missed-call-sla', ...)`.

Paramètres configurables :
- `MISSED_CALL_SLA_MINUTES` (défaut : 30 min) — délai de rappel exigé
- `MISSED_CALL_AUTO_CLOSE_HOURS` (défaut : 24h) — fermeture automatique

**Vérification des breaches SLA (`checkSlaBreaches()`) :**
- Charge les `missed_call_event` avec `status = 'assigned'` et `slaBreachedAt IS NULL`
- Pour chaque événement : vérifie si la tâche de rappel est en retard (`task.dueAt < now AND task.status = 'pending'`) OU si l'événement date de plus de `slaMinutes` sans tâche associée
- Si breach → statut passe à `escalated`, émission événement `missed_call.sla_breached`, notification via `NotificationService`

**Fermeture automatique (`autoCloseOldEvents()`) :**
- Ferme tous les événements `pending`, `assigned` ou `escalated` dont `occurredAt < cutoff (now - autoCloseHours)`
- Marque les tâches associées en `skipped`

---

### 7.5 `MissedCallHandlerService` — Gestion temps réel des appels manqués

**Fichier :** `src/missed-calls/missed-call-handler.service.ts`

Deux sources d'entrée :
1. **Webhook WhatsApp** : écoute `INBOUND_MESSAGE_PROCESSED_EVENT` — si le message est de type `missed_call`, `voice_call`, `video_call`, `call`
2. **DB2** : appelé depuis `syncNewCalls()` pour chaque appel de type `missed`

**Idempotence :** Vérification préalable via `findOne({ where: { externalId } })`.

**Création de tâche de rappel :** Uniquement si `posteId` ou `commercialId` est disponible. `dueAt = now + 30 min`. La tâche est créée via `ActionQueueService.saveTask()`.

**Détection de rappel sortant (`onOutgoingCallDetected()`) :**
Cherche un `missed_call_event` pour le même `clientPhone` et `posteId` avec `status IN ('pending', 'assigned')` et `occurredAt < callTimestamp`. Si trouvé → marque comme `called_back`, ferme la tâche, émet `missed_call.called_back`.

**Backfill au démarrage (`onModuleInit`) :**
- `backfillFromWhatsappMessages()` : recrée les `missed_call_event` depuis les messages WhatsApp de type appel (si `unread_count > 0` → crée + tâche ; sinon → crée en statut `closed`)
- `backfillFromCallEvents()` : recrée depuis les `call_event` avec `call_status = NO_ANSWER`

---

## 8. Angles morts identifiés

### 8.1 Critiques (perte de données ou attribution erronée)

#### AM-C1 — Curseur non incrémental : perte d'appels si batch vide

**Localisation :** `syncNewCalls()`, condition après `qb.getMany()`

Si `calls.length === 0`, la méthode retourne immédiatement sans mettre à jour le curseur. Cela est correct en théorie (rien à traiter). Cependant, si la table DB2 `call_logs` n'a aucun enregistrement depuis `lookbackSince` mais que des enregistrements existent avec un timestamp légèrement antérieur à la lookback window (ex : insertion retardée après plus de 2 minutes), ces appels ne seront **jamais récupérés**. La lookback window de 2 minutes est configurable mais le problème persiste pour des délais supérieurs.

**Impact :** Perte silencieuse d'appels insérés dans DB2 avec un retard > `ORDER_CALL_SYNC_LOOKBACK_MINUTES`.

#### AM-C2 — Race condition lors de la création du batch d'obligations

**Localisation :** `getOrCreateActiveBatch()` dans `CallObligationService`

La méthode utilise un verrou distribué Redis via `lockService.tryWithLock()`. Cependant, si Redis est indisponible (`lockService` = null), la méthode `doCreate()` est appelée directement sans protection. Dans un environnement multi-instances sans Redis, deux processus peuvent créer simultanément deux batches pour le même poste, dupliquant les 15 tâches.

**Impact :** Doublons de batches pouvant fausser les compteurs d'obligations.

#### AM-C3 — Attribution incorrecte si commercial change de poste en cours de cycle

**Localisation :** `syncNewCalls()`, pré-résolution en batch

Les maps `commercialByPhone` et `poolByPosteId` sont calculées **une seule fois** au début du cycle de 200 appels. Si un commercial est réassigné à un autre poste pendant le traitement du batch (peu probable mais possible en production), les appels traités après ce changement utiliseront l'ancienne assignation.

**Impact :** Attribution d'un appel à un poste incorrect — obligation comptabilisée sur le mauvais poste.

#### AM-C4 — call_event_unresolved ne déclenche pas de retry automatique

**Localisation :** `syncNewCalls()`, section N5

Les appels non résolus sont insérés dans `call_event_unresolved` mais **aucun cron ne retraite automatiquement cette table**. Le retry des obligations (`retryUnmatchedObligations()`) travaille sur `call_event` (commercial_id ou device_id déjà présents), pas sur `call_event_unresolved`. Les appels sans commercial ne font jamais l'objet d'un retry automatique : ils ne quittent `call_event_unresolved` que si un admin appelle `markUnresolvedRetried()` manuellement.

**Impact :** Appels définitivement perdus pour l'attribution si le commercial n'est pas résolu lors de la première sync.

#### AM-C5 — Normalisation de la durée potentiellement incorrecte

**Localisation :** `normalizeDuration(raw)` dans `OrderCallSyncService`

La logique de normalisation ms→s est :
```typescript
return raw > 86_400 ? Math.round(raw / 1000) : raw;
```
Seuil : 86 400 secondes = 24 heures. Un appel légitime de 86 401 secondes (environ 24h) serait divisé par 1000, donnant 86 secondes — bien en-dessous du seuil de 90s et potentiellement rejeté. Inversement, un appel stocké en millisecondes d'exactement 86 400 000 ms (24h exactement) ne serait pas normalisé. Cette heuristique est fragile.

**Impact :** Comptabilisation incorrecte de la durée pour des appels très longs ou si la convention DB2 change.

---

### 8.2 Hauts (comportement incorrect silencieux)

#### AM-H1 — Étape 4 de la cascade n'est pas un tiebreaker déterministe

**Localisation :** `resolveCommercialForDevice()`, étape 4

Le tri par `lastConnectionAt DESC` peut retourner des résultats non déterministes si deux commerciaux ont exactement le même `lastConnectionAt` (timestamp par défaut `null` → triés avec `getTime() = 0`). Dans un pool de commerciaux tous non connectés, le tri est instable.

**Impact :** Attribution pseudo-aléatoire entre commerciaux à `lastConnectionAt` identique — impossible à auditer.

#### AM-H2 — Backfill `call_event_unresolved` ne gère pas les appels `outgoing` sans obligation

**Localisation :** `syncNewCalls()`, section N5

Tout appel sans commercial va dans `call_event_unresolved` quelle que soit sa nature (`missed`, `answered`, `outgoing`). Or la table est conçue pour les appels nécessitant un retry (typ. `outgoing` pour les obligations). Les appels `missed` ou `answered` sans commercial sont stockés dans cette table mais ne peuvent pas non plus être retraités automatiquement — la table se remplit sans mécanisme de nettoyage.

**Impact :** Croissance illimitée de `call_event_unresolved`, pollution des logs admin.

#### AM-H3 — `getActiveGroupIds()` compare des chaînes HH:MM sans tenir compte du fuseau horaire

**Localisation :** `WorkScheduleService.getActiveGroupIds(at: Date)`

La comparaison est faite avec `s.startTime > hhmm || s.endTime <= hhmm`. Les heures sont extraites de l'objet `Date` JavaScript via `at.getHours()` et `at.getMinutes()` qui utilisent le **fuseau horaire local du processus Node.js**. Si le serveur tourne en UTC et que les plannings sont saisies en heure locale Côte d'Ivoire (UTC+0, ou UTC+1 selon la saison), la résolution peut être correcte. Mais si le serveur est déployé avec un fuseau UTC et les plannings en UTC+2, le décalage serait de 2 heures.

**Impact :** Attribution au mauvais groupe commercial selon l'heure, potentiellement sur toute une période de travail.

#### AM-H4 — Attribution `is_working_today` jamais réinitialisée

**Localisation :** `syncNewCalls()`, section "Auto-marquer is_working_today"

Le champ `isWorkingToday` est mis à `true` dès qu'un commercial passe un appel, mais **aucun mécanisme ne le remet à `false`** en fin de journée. Le champ `workingTodaySince` est stocké mais non utilisé pour invalider automatiquement. Si un commercial passe un appel un lundi, son `isWorkingToday` restera `true` indéfiniment jusqu'à ce qu'une autre logique le réinitialise (pas trouvée dans le code).

**Impact :** Tous les commerciaux ayant jamais passé un appel ont `isWorkingToday = true` — l'étape 2 de la cascade perd son efficacité discriminante.

#### AM-H5 — `call_log` créé sans `poste_id`

**Localisation :** `syncNewCalls()`, section B — création du `call_log`

La colonne `poste_id` existe dans `call_log` (ajoutée par migration `20260512_add_poste_id_to_call_log.ts`) mais n'est jamais renseignée dans le code de création automatique depuis DB2. Elle reste `null` pour tous les appels synchronisés depuis DB2.

**Impact :** Impossibilité de filtrer les `call_log` par poste — les tableaux de bord commerciaux qui exploitent `poste_id` ne voient pas les appels DB2.

#### AM-H6 — Anti-doublon des alertes batches bloqués réinitialisé au redémarrage

**Localisation :** `ObligationQualityCheckJob`, attribut `lastAlertAt : Map<string, number>`

La map est en mémoire. Au redémarrage du processus, elle est vide. Si le job est configuré toutes les heures et que le processus redémarre, une alerte sera immédiatement renvoyée même si une alerte avait été envoyée 30 minutes avant.

**Impact :** Doublons de notifications lors des redémarrages — risque de spam superviseurs.

#### AM-H7 — `syncClientCategories()` au bootstrap peut écraser des données fraîches

**Localisation :** `OrderCallSyncJob.onApplicationBootstrap()`

`_runSyncClientCategories()` est lancé via `setImmediate` au démarrage, immédiatement après `_run('bootstrap')`. Si la base de données vient d'être peuplée avec des catégories manuelles ou par une migration récente, le resync depuis DB2 peut les écraser — notamment si les données DB2 sont elles-mêmes en retard (ex : livraison non encore enregistrée dans DB2).

**Impact :** Écrasement de catégories manuelles par une valeur DB2 potentiellement incorrecte au démarrage.

---

### 8.3 Moyens (edge cases non couverts)

#### AM-M1 — Client avec deux numéros dans DB2 : seul le premier est utilisé

**Localisation :** `resolveClientCategory()` et `syncClientMapping()`

`GicopUser` a deux champs téléphone : `phone` et `phone2`. Dans `resolveClientCategory()`, la requête cherche sur `(u.phone = :phone OR u.phone2 = :phone)` — c'est correct. Mais l'upsert contact DB1 qui suit utilise `normalizePhone(remoteNumber)` (le numéro appelé par le commercial), qui peut correspondre à `phone2` dans DB2 mais être stocké comme contact avec le `phone2` comme identifiant. Si ce contact est ensuite cherché via son numéro principal, aucune correspondance n'est trouvée.

#### AM-M2 — Race condition sur `tryMatchCallToTask()` pour le même poste

**Localisation :** `CallObligationService.tryMatchCallToTask()`

La méthode n'utilise pas de verrou pour le matching. Deux appels simultanés pour le même poste peuvent tous deux trouver la même `CallTask` en statut `PENDING` et la marquer comme `DONE` deux fois. Le deuxième `save()` écrasera le premier (pas d'erreur SQL unique sur `callEventId`).

**Impact :** Un seul appel valide deux tâches, ou la même tâche est associée à deux appels différents.

#### AM-M3 — Numéro de téléphone non normalisé dans `call_logs` DB2

**Localisation :** `resolveClientCategory()`, `commercialByPhone`

La normalisation `normalizePhone()` est appliquée côté DB1, mais DB2 peut stocker les numéros dans des formats variés (avec/sans indicatif, avec espaces...). La requête sur `GicopUser` compare directement `u.phone = :phone` avec le numéro déjà normalisé. Si DB2 stocke `0708 12 34 56` et que `normalizePhone()` produit `070812345`, la comparaison échoue.

#### AM-M4 — Appel entrant non comptabilisé dans les obligations

**Localisation :** `isEligibleForObligation()`

Seuls les appels `outgoing` sont éligibles aux obligations GICOP. Un appel `answered` (entrant décroché par le commercial) ne compte pas, même si le commercial a eu une vraie conversation avec un client d'une catégorie ciblée. Cette règle est intentionnelle mais peut paraître surprenante.

#### AM-M5 — Pool de commerciaux par poste inclut des commerciaux soft-deleted

**Localisation :** `syncNewCalls()`, pré-résolution Niveau 1

La requête sur `commercialsAtPoste` filtre `deletedAt: IsNull()`, ce qui est correct. Cependant, la vérification est faite au niveau du commercial, pas du `CallDevice`. Si un `CallDevice` pointe vers un `posteId` dont tous les commerciaux ont été supprimés, `poolByPosteId.get(device.posteId)` retournera un tableau vide, et la résolution tombera en fallback `phone` — comportement correct mais non tracé dans les logs.

#### AM-M6 — `backfillFromCallEvents()` charge TOUS les call_event NO_ANSWER sans pagination

**Localisation :** `MissedCallHandlerService.backfillFromCallEvents()`

```typescript
const callEvents = await this.callEventRepo.find({
  where: { call_status: CallStatus.NO_ANSWER },
  order: { event_at: 'ASC' },
});
```

Aucune limite (`take`). Au démarrage, si la table `call_event` contient des milliers d'appels `no_answer`, cette requête peut charger un volume important en mémoire.

**Impact :** Risque d'OOM ou de lenteur au démarrage sur une instance avec un grand historique.

#### AM-M7 — Vérification `existsAnyForEntity` avant `processCall()`

**Localisation :** `syncNewCalls()`, condition juste avant `processCall(call)`

```typescript
const alreadyProcessed = await this.syncLog.existsAnyForEntity('call_validation', call.id);
if (alreadyProcessed) continue;
```

Si un appel `outgoing` a déjà été traité (succès ou échec) dans `integration_sync_log`, il est skippé sans être comptabilisé dans `newCalls`. Mais si le statut est `failed` (et non `success`), le retry est délégué au cron de 5 min via `retryUnmatchedObligations()`. La logique est correcte mais le `existsAnyForEntity` couvre `pending`, `success` et `failed` — un appel en statut `pending` bloqué (ex : processus crashé) ne sera jamais retraité par la boucle principale (il restera `pending` indéfiniment).

#### AM-M8 — Requête SQL brute dans `MissedCallService.list()`

**Localisation :** `src/missed-calls/missed-call.service.ts`, méthode `list()`

```typescript
const callLogs = await this.commercialRepo.manager.query(
  `SELECT call_event_external_id, commercial_name FROM call_log WHERE call_event_external_id IN (...)`,
  callbackEventIds,
);
```

Requête SQL brute sans ORM. Aucun problème fonctionnel majeur, mais c'est une déviation des conventions du projet (QueryBuilder ou `find`). Le nom de la table (`call_log`) est codé en dur — toute renommage cassera silencieusement.

---

## 9. Recommandations de supervision

### 9.1 Métriques à surveiller en temps réel

**Pipeline de sync :**
- Nombre d'appels traités par cycle (`Sync DB2 terminée — X appels`)
- Nombre d'erreurs par cycle (log `Erreur traitement appel`)
- Nombre d'appels non résolus (`call_event_unresolved` avec `resolved_at IS NULL`)
- Âge du dernier curseur (`order_call_sync_cursor.updated_at`) — alerte si > 5 min

**Attribution commerciale :**
- Taux d'attribution : `call_event` avec `commercial_id IS NOT NULL` / total
- Distribution par `attribution_source` : `device_poste` vs `phone` vs `null`
- Taille de `call_event_unresolved` (doit tendre vers 0)

**Obligations GICOP :**
- Nombre de batches `PENDING` par poste
- Âge des batches `PENDING` (alerte si > 3 jours — déjà en place via `alertStuckBatches`)
- Taux de matching par catégorie (`CALL_OBLIGATION_REJECTED reason=quota_categorie_atteint`)
- Nombre d'appels éligibles en retry (`retrySteps.withoutSuccess` dans les diagnostics)

**Appels manqués :**
- Nombre d'événements `escalated` (SLA breach)
- Taux de conformité SLA (`slaComplianceRate`)
- Délai moyen de rappel (`avgHandlingDelaySeconds`)

### 9.2 Logs structurés existants à exploiter

Tous ces logs sont déjà émis et exploitables via un agrégateur (ex : Loki, Datadog) :

| Pattern de log | Signal |
|---|---|
| `CALL_OBLIGATION_MATCHED` | Attribution obligation réussie |
| `CALL_OBLIGATION_REJECTED reason=*` | Toutes les causes de rejet |
| `CALL_OBLIGATION_BATCH_CALLS_COMPLETE` | Batch complété (rotation possible) |
| `CALL_MATCHED_ERP_ONLY` | Client sans compte WhatsApp — obligation validée |
| `MISSED_CALL_ESCALATED` | SLA appel manqué dépassé |
| `MISSED_CALL_CLOSED` | Rappel effectué |
| `MISSED_CALL_CALLBACK` | Appel sortant identifié comme rappel |
| `backfillNullDeviceIds — N mis à jour` | Qualité des données call_event |
| `STUCK_BATCH_ALERT_SENT` | Batch bloqué > 3j |
| `LOCK_SKIPPED cron:order-call-sync` | Redis verrou actif (normal en cluster) |

### 9.3 Endpoint de diagnostic

L'endpoint `getDiagnostics()` de `OrderCallSyncService` retourne un tableau de bord complet :
- `callStatusDistribution` — répartition des `call_status` dans `call_event`
- `deviceStats` — appels avec/sans `device_id`, avec poste associé
- `retrySteps` — funnel de filtrage pour le retry (total → avec status → avec durée → avec attribution → sans succès)
- `activeBatchPosteIds` — postes avec batch actif
- `featureFlagEnabled` — état du feature flag `FF_CALL_OBLIGATIONS_ENABLED`
- `db2Stats` — stats sur les appels sortants dans DB2

Ce diagnostic est exposé via `OrderSyncAdminController` — à monitorer régulièrement.

---

## 10. Checklist de contrôles opérationnels

### Déploiement initial / mise en production

- [ ] Vérifier que `ORDER_DB_DATA_SOURCE` est configuré et que `ORDER_DB_AVAILABLE = true`
- [ ] Exécuter toutes les migrations dans l'ordre chronologique (`20260218_create_call_log.ts` → `20260512_create_missed_call_event.ts`)
- [ ] Vérifier que la table `call_device` est vide — les devices doivent être découverts automatiquement
- [ ] Configurer manuellement les associations `device_id → posteId` dans `call_device` via l'admin UI pour chaque téléphone commercial
- [ ] Activer le feature flag `FF_CALL_OBLIGATIONS_ENABLED = true` uniquement une fois les associations devices configurées
- [ ] Vérifier `CALL_QUALITY_THRESHOLD_PCT` (défaut 80%) — ajuster selon les SLA métier
- [ ] Vérifier `MISSED_CALL_SLA_MINUTES` (défaut 30) et `MISSED_CALL_AUTO_CLOSE_HOURS` (défaut 24)
- [ ] Lancer `initAllBatches()` (ou attendre le bootstrap) pour créer les batches initiaux sur tous les postes

### Contrôles quotidiens

- [ ] Vérifier que `call_event_unresolved` ne croît pas anormalement (> 50 entrées sans `resolved_at`)
- [ ] Vérifier l'état du curseur `order_call_sync_cursor.updated_at` — doit être < 2 min
- [ ] Vérifier qu'aucune notification `STUCK_BATCH_ALERT_SENT` n'a été émise
- [ ] Contrôler le taux d'attribution (appels avec `commercial_id IS NOT NULL`)

### Après un redémarrage du processus

- [ ] Vérifier dans les logs le résultat de `BACKFILL_WHATSAPP_COMPLETE` et `BACKFILL_COMPLETE` (backfills au démarrage)
- [ ] Vérifier que les batches actifs sont toujours présents après `initAllBatches`
- [ ] Surveiller les premières minutes pour détecter des alertes `STUCK_BATCH_ALERT_SENT` intempestives (AM-H6)

### Contrôles hebdomadaires

- [ ] Vérifier la taille de `integration_sync_log` — doit être purgée automatiquement (dimanche 4h) mais surveiller la croissance
- [ ] Vérifier les mappings orphelins supprimés par `cleanOrphans()` (dimanche 3h) — des suppressions anormalement élevées indiquent des problèmes de cohérence
- [ ] Analyser les rejets d'obligations par catégorie — si `quota_categorie_atteint` est très fréquent pour une catégorie, cela peut indiquer un manque de diversité des clients contactés

### Configuration des plannings de groupes

- [ ] S'assurer que chaque commercial est assigné à un `groupId` (sinon l'étape 1 de la cascade est inopérante)
- [ ] S'assurer que les `WorkSchedule` sont correctement configurés avec `groupId` (pas `commercialId`) pour la résolution pool
- [ ] Vérifier le fuseau horaire du serveur Node.js correspond aux heures saisies dans `work_schedule`

### Actions de maintenance correctives

- [ ] Si `call_event` contient des lignes avec `duration_seconds = 0` : exécuter `backfillDurations()` via l'API admin
- [ ] Si `call_event` contient des lignes sans `device_id` : exécuter `backfillDeviceIds()` via l'API admin
- [ ] Si `call_event.call_status` contient des valeurs en majuscules : exécuter `normalizeCallStatus()` via l'API admin
- [ ] Si `integration_sync_log` contient des milliers de lignes `pending` bloquées : exécuter `purgeStuckPending()` via l'API admin
- [ ] Si des obligations ont été validées sur le mauvais poste : corriger manuellement via `call_task` (pas d'API admin dédiée)

---

## Annexe — Correspondance des entités DB2 ↔ DB1

| Table DB2 | Entité DB1 | Pivot | Sens |
|---|---|---|---|
| `call_logs` | `call_event`, `call_log` | `id` (external_id) | Read-only DB2 → Write DB1 |
| `users` (type=commercial) | `WhatsappCommercial` | `phone` ↔ `local_number` | Lecture seule |
| `users` (type=client) | `Contact` | `phone` ↔ `remote_number` | Lecture seule + upsert category |
| `commandes` | — | `id_client` (clientIdDb2) | Lecture seule pour catégorie |
| `statuts_commandes` | — | `id_commande` | Lecture seule pour catégorie |
| `users.device_id` | `CallDevice.deviceId` | `device_id` | Lecture seule (non utilisé en pratique) |

---

*Rapport généré le 2026-05-15 — basé sur l'analyse statique du code source dans `message_whatsapp/src/`.*
