# Plan de Correction — Attribution des Appels Téléphoniques

**Basé sur :** `RAPPORT_ATTRIBUTION_APPELS.md`
**Date :** 2026-05-15
**Priorités :** C = Critique · H = Haut · M = Moyen

---

## Résumé des corrections

| ID | Angle mort | Priorité | Effort | Sprint suggéré |
|---|---|---|---|---|
| FIX-C1 | Perte d'appels si délai d'insertion DB2 > lookback window | Critique | S | Sprint 1 |
| FIX-C2 | Race condition création batch sans Redis | Critique | M | Sprint 1 |
| FIX-C3 | Attribution stale si réassignation en cours de cycle | Critique | S | Sprint 1 |
| FIX-C4 | Retry automatique des appels non résolus | Critique | M | Sprint 1 |
| FIX-C5 | Normalisation durée — seuil heuristique fragile | Critique | S | Sprint 1 |
| FIX-H1 | Tiebreaker non déterministe (lastConnectionAt nul) | Haut | S | Sprint 2 |
| FIX-H2 | Nettoyage call_event_unresolved pour appels non-outgoing | Haut | S | Sprint 2 |
| FIX-H3 | Fuseau horaire dans getActiveGroupIds() | Haut | S | Sprint 2 |
| FIX-H4 | is_working_today jamais réinitialisé | Haut | M | Sprint 2 |
| FIX-H5 | poste_id absent du call_log | Haut | S | Sprint 2 |
| FIX-H6 | Anti-doublon alertes batches en mémoire | Haut | S | Sprint 2 |
| FIX-H7 | syncClientCategories écrase au bootstrap | Haut | S | Sprint 2 |
| FIX-M1 | Client phone2 — contact upsert incohérent | Moyen | S | Sprint 3 |
| FIX-M2 | Race condition tryMatchCallToTask() | Moyen | M | Sprint 3 |
| FIX-M3 | Numéros non normalisés DB2 — comparaison directe | Moyen | M | Sprint 3 |
| FIX-M6 | backfillFromCallEvents() sans pagination | Moyen | S | Sprint 3 |
| FIX-M7 | integration_sync_log status pending bloqué indéfiniment | Moyen | S | Sprint 3 |
| FIX-M8 | Requête SQL brute dans MissedCallService.list() | Moyen | S | Sprint 3 |

**Effort :** S = < 2h · M = 2–4h · L = > 4h

---

## Sprint 1 — Corrections Critiques

---

### FIX-C1 — Perte d'appels avec délai d'insertion DB2 > lookback window

**Angle mort :** AM-C1
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** La lookback window est de 2 minutes (`ORDER_CALL_SYNC_LOOKBACK_MINUTES`). Si DB2 insère un appel avec un retard > 2 min (réseau lent, réplication DB2), il ne sera jamais récupéré.

**Solution :**

1. **Augmenter la lookback par défaut à 10 minutes** — les INSERTs IGNORE sur `call_event.external_id` garantissent l'idempotence, donc relire les 10 dernières minutes à chaque cycle est sans danger.

2. **Ajouter une alerte si le batch retourne exactement `batchSize` résultats** — cela signifie qu'il y a peut-être plus d'appels non lus : ne pas avancer le curseur dans ce cas, ou paginer.

**Changements :**

```typescript
// order-call-sync.service.ts — section "Étape 1"
// Avant :
const CURSOR_LOOKBACK_MINUTES_DEFAULT = 2;
// Après :
const CURSOR_LOOKBACK_MINUTES_DEFAULT = 10;
```

```typescript
// Après la boucle, avant la mise à jour du curseur :
if (calls.length >= batchSize) {
  this.logger.warn(
    `Sync DB2 : batch plein (${batchSize} appels) — possible troncature. Curseur NON avancé, prochain cycle relira depuis le même point.`,
  );
  return { processed: newCalls, obligations: obligationsMatched, errors };
  // Ne pas mettre à jour le curseur — force un re-traitement au prochain cycle
}
```

**Variable d'environnement à documenter :**
- `ORDER_CALL_SYNC_LOOKBACK_MINUTES` — défaut 10 (au lieu de 2)

---

### FIX-C2 — Race condition création batch sans Redis

**Angle mort :** AM-C2
**Fichier :** `src/call-obligations/call-obligation.service.ts`

**Problème :** Si Redis est indisponible, `getOrCreateActiveBatch()` appelle `doCreate()` sans verrou, permettant la création de batches en double en multi-instances.

**Solution :** Ajouter une contrainte UNIQUE SQL sur `(poste_id, status)` WHERE `status = 'pending'` pour que le second INSERT échoue proprement. Combiner avec un `findOrCreate` atomique via `INSERT ... ON DUPLICATE KEY UPDATE`.

**Changements :**

**1. Migration SQL** — à créer : `20260515_unique_pending_batch_per_poste.ts`

```sql
-- Un seul batch PENDING par poste à la fois
CREATE UNIQUE INDEX UQ_one_pending_batch_per_poste
  ON commercial_obligation_batch (poste_id, status)
  WHERE status = 'pending';
```

> Note MySQL : MySQL ne supporte pas les index partiels WHERE. Solution alternative : utiliser un champ calculé ou une contrainte applicative renforcée.

**Alternative applicative (MySQL-compatible) :**

```typescript
// call-obligation.service.ts — getOrCreateActiveBatch()
async getOrCreateActiveBatch(posteId: string): Promise<CommercialObligationBatch> {
  // Double vérification après lock — même sans Redis
  const existing = await this.batchRepo.findOne({
    where: { posteId, status: BatchStatus.PENDING },
  });
  if (existing) return existing;

  // Utiliser INSERT IGNORE + re-fetch pour éviter les doublons
  try {
    await this.batchRepo.insert({
      posteId,
      status: BatchStatus.PENDING,
      batchNumber: await this.getNextBatchNumber(posteId),
      // ... autres champs
    });
  } catch (e) {
    // Contrainte dupliquée → un autre processus a créé le batch
    if (e.code !== 'ER_DUP_ENTRY') throw e;
  }

  return this.batchRepo.findOneOrFail({ where: { posteId, status: BatchStatus.PENDING } });
}
```

**2. Ajouter un index UNIQUE sur `(poste_id, batch_number)` :** déjà protégé par le numéro séquentiel, mais le rendre explicite.

---

### FIX-C3 — Attribution stale si réassignation en cours de cycle

**Angle mort :** AM-C3
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** Les maps `commercialByPhone` et `poolByPosteId` sont calculées une fois pour 200 appels. Un changement de poste pendant le traitement du batch produit une attribution incorrecte.

**Solution :** Pas de refactoring majeur (recalculer à chaque appel serait trop coûteux). Ajouter un **log de traçabilité** sur `attribution_source` et réduire `batchSize` à 100 pour limiter la fenêtre temporelle. Si la réassignation est un cas courant, ajouter une alerte si un commercial change de poste dans la dernière heure.

**Changements :**

```typescript
// order-call-sync.service.ts
// Réduire la taille par défaut du batch pour raccourcir la fenêtre de stale
const ORDER_CALL_SYNC_BATCH_SIZE_DEFAULT = 100; // était 200
```

```typescript
// Dans ingestFromDb2() — si commercial_id change pour un call_event déjà présent :
if (existingEvent.commercialId && existingEvent.commercialId !== commercialId) {
  this.logger.warn(
    `Attribution modifiée pour external_id=${externalId} : ancien=${existingEvent.commercialId} → nouveau=${commercialId}. Vérifier réassignation poste.`,
  );
}
```

**Variable d'environnement :**
- `ORDER_CALL_SYNC_BATCH_SIZE` — défaut 100 (au lieu de 200)

---

### FIX-C4 — Retry automatique des appels non résolus (call_event_unresolved)

**Angle mort :** AM-C4
**Fichiers :** `src/order-call-sync/order-call-sync.job.ts`, `src/order-call-sync/order-call-sync.service.ts`

**Problème :** `call_event_unresolved` est une file morte : aucun cron ne retraite les appels qui s'y trouvent. Les appels y restent indéfiniment si aucun admin ne déclenche manuellement le retry.

**Solution :** Ajouter un cron de retry automatique dans `OrderCallSyncJob` qui tente de résoudre les entrées de `call_event_unresolved` dont `resolved_at IS NULL`.

**Changements :**

```typescript
// order-call-sync.job.ts — ajouter après retryObligations()
@Cron('0 */15 * * * *') // toutes les 15 minutes
async retryUnresolved(): Promise<void> {
  if (this.running) return;
  try {
    await this.syncService.retryUnresolvedCalls();
  } catch (e) {
    this.logger.error('retryUnresolved échoué', e);
  }
}
```

```typescript
// order-call-sync.service.ts — nouvelle méthode
async retryUnresolvedCalls(limit = 50): Promise<void> {
  const unresolved = await this.unresolvedRepo.find({
    where: { resolvedAt: IsNull() },
    order: { createdAt: 'ASC' },
    take: limit,
  });

  if (!unresolved.length) return;

  // Recalculer les maps de résolution
  const commercialByPhone = await this.buildCommercialByPhoneMap();
  const poolByPosteId     = await this.buildPoolByPosteIdMap();

  for (const entry of unresolved) {
    const commercialId = await this.resolveCommercialId(
      entry.deviceId,
      entry.localNumber,
      new Date(), // timestamp courant — approximation acceptable pour un retry
      poolByPosteId,
      commercialByPhone,
    );

    if (!commercialId) continue; // toujours non résolu

    // Marquer comme résolu
    await this.unresolvedRepo.update(entry.id, { resolvedAt: new Date() });

    // Backfill dans call_event
    await this.callEventService.backfillCommercialId(entry.externalId, commercialId);

    this.logger.log(`Retry résolu : externalId=${entry.externalId} → commercial=${commercialId}`);
  }
}
```

```typescript
// call-event.service.ts — ajouter méthode de backfill
async backfillCommercialId(externalId: string, commercialId: string): Promise<void> {
  await this.callEventRepo.update(
    { externalId },
    { commercialId, attributionSource: 'retry' },
  );
}
```

---

### FIX-C5 — Normalisation durée — seuil heuristique fragile

**Angle mort :** AM-C5
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** `raw > 86_400 ? Math.round(raw / 1000) : raw` — le seuil de 24h pour distinguer ms de s est fragile et traite incorrectement les appels de 24h ou les ms entre 0 et 86 400.

**Solution :** Utiliser une heuristique plus robuste : si la valeur est > 3 600 000 (1 heure en ms), c'est probablement en millisecondes. Logguer les cas ambigus.

**Changements :**

```typescript
// order-call-sync.service.ts
private normalizeDuration(raw: number | null): number {
  if (raw === null || raw === undefined) return 0;
  if (raw < 0) return 0;

  // Heuristique : > 1h en secondes (3600s) mais plausible en ms (= 3.6s)
  // On utilise 7200 (2h) comme seuil : un appel légitime de 2h en secondes est rare
  // mais 7200 ms = 7.2 secondes est très courant.
  if (raw > 7_200) {
    const asSec = Math.round(raw / 1000);
    this.logger.debug(`normalizeDuration: ${raw} → interprété comme ms → ${asSec}s`);
    return asSec;
  }
  return raw;
}
```

> Ce seuil (7 200s = 2h) couvre les cas les plus courants en contexte commercial. Un appel GICOP de plus de 2h est exceptionnel. Ajuster via `ORDER_CALL_DURATION_MS_THRESHOLD_SEC` si nécessaire.

**Variable d'environnement (optionnelle) :**
- `ORDER_CALL_DURATION_MS_THRESHOLD_SEC` — défaut 7200

---

## Sprint 2 — Corrections Hautes

---

### FIX-H1 — Tiebreaker non déterministe (lastConnectionAt nul)

**Angle mort :** AM-H1
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** À l'étape 4 de `resolveCommercialForDevice()`, si plusieurs commerciaux ont `lastConnectionAt = null`, le tri est instable.

**Changements :**

```typescript
// resolveCommercialForDevice() — étape 4
// Avant :
pool.sort((a, b) =>
  (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0),
);
// Après :
pool.sort((a, b) => {
  const diff =
    (b.lastConnectionAt?.getTime() ?? 0) - (a.lastConnectionAt?.getTime() ?? 0);
  if (diff !== 0) return diff;
  // Tiebreaker déterministe : tri alphabétique sur l'UUID
  return a.id.localeCompare(b.id);
});

if (pool.length > 1) {
  this.logger.debug(
    `resolveCommercialForDevice étape 4 — tiebreaker dernier connecté sur ${pool.length} candidats. Résolu: ${pool[0].id}`,
  );
}
```

---

### FIX-H2 — Nettoyage call_event_unresolved pour appels non-outgoing

**Angle mort :** AM-H2
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** Les appels `missed`, `answered`, `rejected` sans commercial sont stockés dans `call_event_unresolved` alors qu'ils ne peuvent jamais être réessayés pour les obligations (seuls les `outgoing` sont éligibles).

**Changements :**

```typescript
// syncNewCalls() — section N5 (gestion appels non résolus)
// Ajouter le callType dans l'entrée unresolved
await this.unresolvedRepo.upsert(
  {
    externalId: call.id,
    localNumber: call.localNumber,
    remoteNumber: call.remoteNumber,
    deviceId: call.deviceId,
    callType: call.callType, // NOUVEAU — ajouter cette colonne
    reason: 'commercial_not_found',
  },
  ['externalId'],
);
```

**Migration à créer :** `20260515_add_call_type_to_unresolved.ts`
```sql
ALTER TABLE call_event_unresolved
  ADD COLUMN call_type VARCHAR(20) NULL DEFAULT NULL AFTER device_id;
```

**Ajout d'un cron de purge des non-outgoing :**
```typescript
// order-call-sync.job.ts
@Cron('0 5 * * 0') // dimanche à 5h
async cleanNonOutgoingUnresolved(): Promise<void> {
  const result = await this.unresolvedRepo.delete({
    callType: Not('outgoing'),
    resolvedAt: IsNull(),
  });
  this.logger.log(`Purge call_event_unresolved non-outgoing : ${result.affected} lignes supprimées`);
}
```

---

### FIX-H3 — Fuseau horaire dans getActiveGroupIds()

**Angle mort :** AM-H3
**Fichier :** `src/work-schedule/work-schedule.service.ts` (ou équivalent)

**Problème :** `at.getHours()` et `at.getMinutes()` utilisent le fuseau local du processus Node.js, qui peut différer de celui des plannings.

**Changements :**

```typescript
// work-schedule.service.ts
import { format } from 'date-fns-tz';

// Récupérer la timezone depuis SystemConfig ou variable d'environnement
const TZ = process.env.APP_TIMEZONE ?? 'Africa/Abidjan';

getActiveGroupIds(at: Date): Promise<string[]> {
  // Extraire HH:MM dans le fuseau horaire de l'application
  const hhmm = format(at, 'HH:mm', { timeZone: TZ });
  // ... reste de la logique inchangée
}
```

**Variable d'environnement à ajouter :**
- `APP_TIMEZONE` — ex. `Africa/Abidjan` (UTC+0), `Africa/Douala` (UTC+1)

**Vérification :** S'assurer que `date-fns-tz` est dans les dépendances (`package.json`).

---

### FIX-H4 — is_working_today jamais réinitialisé

**Angle mort :** AM-H4
**Fichier :** `src/order-call-sync/order-call-sync.job.ts`

**Problème :** `isWorkingToday = true` est positionné lors d'un appel mais jamais remis à `false`. L'étape 2 de la cascade devient inopérante après quelques jours.

**Solution :** Cron quotidien à minuit pour remettre `isWorkingToday = false` sur tous les commerciaux.

**Changements :**

```typescript
// order-call-sync.job.ts
@Cron('0 0 0 * * *') // tous les jours à minuit
async resetWorkingToday(): Promise<void> {
  const result = await this.syncService.resetAllWorkingToday();
  this.logger.log(`Reset is_working_today : ${result.affected} commerciaux remis à false`);
}
```

```typescript
// order-call-sync.service.ts
async resetAllWorkingToday(): Promise<UpdateResult> {
  return this.commercialRepo.update(
    { isWorkingToday: true },
    { isWorkingToday: false },
  );
}
```

> **Note :** Vérifier que le cron de reset se déclenche AVANT le bootstrap de `syncNewCalls()` si le serveur redémarre à minuit (le `setImmediate` au bootstrap peut tourner en même temps).

---

### FIX-H5 — poste_id absent du call_log

**Angle mort :** AM-H5
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** La colonne `poste_id` de `call_log` est toujours `null` pour les appels synchronisés depuis DB2.

**Changements :**

```typescript
// syncNewCalls() — section B "Création du call_log"
// Résoudre le posteId depuis le commercial avant la création
let resolvedPosteId: string | null = null;
if (commercialIdDb1) {
  const commercial = await this.commercialRepo.findOne({
    where: { id: commercialIdDb1 },
    relations: ['poste'],
  });
  resolvedPosteId = commercial?.poste?.id ?? null;
}

await this.callLogRepo.save({
  // ... champs existants
  posteId: resolvedPosteId, // NOUVEAU
  callEventExternalId: String(call.id),
});
```

> **Optimisation :** Charger le `posteId` depuis le pool pré-calculé (qui contient déjà les commerciaux avec leurs postes) plutôt que de refaire une requête DB.

---

### FIX-H6 — Anti-doublon alertes batches bloqués en mémoire

**Angle mort :** AM-H6
**Fichier :** `src/call-obligations/obligation-quality-check.job.ts`

**Problème :** `lastAlertAt` est un `Map` en mémoire, réinitialisé au redémarrage. Des alertes en doublon sont envoyées après chaque redémarrage.

**Solution :** Persister le timestamp de la dernière alerte dans la table `commercial_obligation_batch`.

**Migration :** `20260515_add_last_alert_at_to_batch.ts`
```sql
ALTER TABLE commercial_obligation_batch
  ADD COLUMN last_alert_at DATETIME NULL DEFAULT NULL;
```

**Changements :**

```typescript
// obligation-quality-check.job.ts
// Supprimer : private lastAlertAt = new Map<string, number>();

// Dans alertStuckBatches() — remplacer la vérification en mémoire :
for (const batch of stuckBatches) {
  // Lire depuis DB
  const lastAlert = batch.lastAlertAt;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (lastAlert && lastAlert > oneDayAgo) continue; // Alerte récente

  await this.notificationService.send(/* ... */);

  // Persister la date d'alerte
  await this.batchRepo.update(batch.id, { lastAlertAt: new Date() });
  this.logger.log(`STUCK_BATCH_ALERT_SENT batchId=${batch.id}`);
}
```

---

### FIX-H7 — syncClientCategories écrase au bootstrap

**Angle mort :** AM-H7
**Fichier :** `src/order-call-sync/order-call-sync.job.ts`

**Problème :** `syncClientCategories()` lancé via `setImmediate` au démarrage peut écraser des catégories manuelles avec des données DB2 potentiellement en retard.

**Solution :** Ajouter un délai configurable avant la sync bootstrap des catégories, et ne pas écraser une catégorie si elle a été modifiée manuellement récemment (champ `categoryUpdatedManually`).

**Changements immédiats (court terme) :**

```typescript
// order-call-sync.job.ts — onApplicationBootstrap()
// Retarder la sync des catégories de 5 minutes au bootstrap
setTimeout(() => this._runSyncClientCategories(), 5 * 60 * 1000);
```

**Moyen terme — ajouter un flag `categoryLockedUntil` sur Contact :**
```typescript
// contact.entity.ts
@Column({ nullable: true })
categoryLockedUntil: Date | null; // ne pas écraser avant cette date

// syncClientCategories() — ajouter condition
if (contact.categoryLockedUntil && contact.categoryLockedUntil > new Date()) {
  this.logger.debug(`Catégorie verrouillée pour contact=${contact.id}`);
  continue;
}
```

---

## Sprint 3 — Corrections Moyennes

---

### FIX-M1 — Client avec phone2 — upsert contact incohérent

**Angle mort :** AM-M1
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** Un client trouvé via `phone2` peut créer un contact DB1 avec `phone2` comme numéro principal, créant une incohérence si ce client a déjà un contact DB1 avec `phone1`.

**Changements :**

```typescript
// resolveClientCategory() — section upsert Contact
// Avant de créer/mettre à jour, chercher le contact existant sur LES DEUX numéros
const gicopUser = foundUser; // GicopUser depuis DB2
const phoneMain = normalizePhone(gicopUser.phone);
const phoneAlt  = gicopUser.phone2 ? normalizePhone(gicopUser.phone2) : null;

const existingContact = await this.contactRepo.findOne({
  where: [
    { phone: phoneMain },
    ...(phoneAlt ? [{ phone: phoneAlt }] : []),
  ],
});

// Utiliser le contact existant ou créer avec le numéro principal (phone, pas phone2)
const contactPhone = existingContact?.phone ?? phoneMain;
```

---

### FIX-M2 — Race condition tryMatchCallToTask()

**Angle mort :** AM-M2
**Fichier :** `src/call-obligations/call-obligation.service.ts`

**Problème :** Deux appels simultanés peuvent valider la même `CallTask`.

**Solution :** Ajouter un index UNIQUE sur `call_task.callEventId` et gérer l'erreur de doublon.

**Migration :** `20260515_unique_call_event_id_in_task.ts`
```sql
ALTER TABLE call_task
  ADD UNIQUE INDEX UQ_call_task_call_event_id (call_event_id);
```

**Changements :**

```typescript
// tryMatchCallToTask() — wrapper de la section "Marquer la tâche DONE"
try {
  await this.taskRepo.update(task.id, {
    status: CallTaskStatus.DONE,
    callEventId: callEventId,
    clientPhone,
    durationSeconds,
    completedAt: new Date(),
  });
} catch (e) {
  if (e.code === 'ER_DUP_ENTRY') {
    this.logger.warn(`tryMatchCallToTask: callEventId=${callEventId} déjà utilisé dans une autre tâche`);
    return { matched: false, reason: 'appel_deja_traite' };
  }
  throw e;
}
```

---

### FIX-M3 — Numéros non normalisés DB2 — comparaison directe

**Angle mort :** AM-M3
**Fichier :** `src/order-call-sync/order-call-sync.service.ts`

**Problème :** `resolveClientCategory()` compare un numéro normalisé côté DB1 avec la valeur brute stockée dans DB2 (via `u.phone = :phone`).

**Solution :** Chercher aussi avec le numéro brut original en plus du normalisé, ou normaliser les numéros DB2 côté SQL.

**Changements :**

```typescript
// resolveClientCategory() — requête DB2
const normalized = normalizePhone(remoteNumber);
const raw = remoteNumber; // numéro tel quel, avant normalisation

const client = await gicopUserRepo
  .createQueryBuilder('u')
  .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
  .andWhere('u.valid = 1')
  .andWhere(
    new Brackets(qb =>
      qb
        .where('u.phone = :norm OR u.phone2 = :norm', { norm: normalized })
        .orWhere('u.phone = :raw OR u.phone2 = :raw', { raw }),
    ),
  )
  .getOne();
```

---

### FIX-M6 — backfillFromCallEvents() sans pagination

**Angle mort :** AM-M6
**Fichier :** `src/missed-calls/missed-call-handler.service.ts`

**Problème :** Chargement de TOUS les `call_event` NO_ANSWER sans limite au démarrage — risque d'OOM.

**Changements :**

```typescript
// backfillFromCallEvents() — ajouter pagination
const BACKFILL_PAGE_SIZE = 200;
let offset = 0;

while (true) {
  const callEvents = await this.callEventRepo.find({
    where: { call_status: CallStatus.NO_ANSWER },
    order: { event_at: 'ASC' },
    skip: offset,
    take: BACKFILL_PAGE_SIZE,
  });

  if (!callEvents.length) break;

  for (const ce of callEvents) {
    await this.handleMissedCallFromCallEvent(ce).catch(e =>
      this.logger.error(`backfillFromCallEvents échoué pour ${ce.id}`, e),
    );
  }

  offset += callEvents.length;
  if (callEvents.length < BACKFILL_PAGE_SIZE) break;
}

this.logger.log(`BACKFILL_COMPLETE : ${offset} call_events traités`);
```

---

### FIX-M7 — integration_sync_log status pending bloqué indéfiniment

**Angle mort :** AM-M7
**Fichier :** `src/order-call-sync/order-call-sync.service.ts` (ou `integration-sync/`)

**Problème :** Un appel en statut `pending` dans `integration_sync_log` (processus crashé) est exclu de la boucle principale ET du retry — il est bloqué indéfiniment.

**Solution :** Ajouter un déblocage automatique des `pending` anciens dans `purgeOldSyncLogs()`.

**Changements :**

```typescript
// Ajouter dans le cron de purge hebdomadaire (dimanche 4h)
async purgeOldSyncLogs(): Promise<void> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Purge classique > 30j
  await this.syncLogRepo.delete({ createdAt: LessThan(cutoff30d) });

  // NOUVEAU — Débloquer les pending > 1h (processus crashé)
  const cutoff1h = new Date(Date.now() - 60 * 60 * 1000);
  const stuckResult = await this.syncLogRepo.update(
    { status: 'pending', createdAt: LessThan(cutoff1h) },
    { status: 'failed', note: 'auto-unblocked: stuck pending > 1h' },
  );

  if (stuckResult.affected > 0) {
    this.logger.warn(`Déblocage de ${stuckResult.affected} lignes integration_sync_log pending bloquées`);
  }
}
```

---

### FIX-M8 — Requête SQL brute dans MissedCallService.list()

**Angle mort :** AM-M8
**Fichier :** `src/missed-calls/missed-call.service.ts`

**Problème :** Requête SQL brute avec nom de table codé en dur — fragile au renommage.

**Changements :**

```typescript
// Remplacer la requête brute par QueryBuilder
const callLogs = await this.callLogRepo
  .createQueryBuilder('cl')
  .select(['cl.callEventExternalId', 'cl.commercialName'])
  .where('cl.callEventExternalId IN (:...ids)', { ids: callbackEventIds })
  .getRawMany<{ callEventExternalId: string; commercialName: string }>();
```

---

## Ordre d'exécution recommandé

### Sprint 1 (semaine 1) — Ne pas bloquer la livraison

```
FIX-C5 (2h) → FIX-C1 (2h) → FIX-C3 (1h) → FIX-C4 (4h) → FIX-C2 (3h)
```

Commencer par FIX-C5 (le plus simple) pour valider le pipeline de déploiement, puis FIX-C4 (le plus impactant en production).

### Sprint 2 (semaine 2) — Amélioration qualité

```
FIX-H4 (2h) → FIX-H1 (1h) → FIX-H5 (2h) → FIX-H3 (1h) → FIX-H6 (2h) → FIX-H7 (1h) → FIX-H2 (2h)
```

### Sprint 3 (semaine 3) — Robustesse

```
FIX-M6 (1h) → FIX-M7 (1h) → FIX-M8 (1h) → FIX-M2 (2h) → FIX-M3 (2h) → FIX-M1 (2h)
```

---

## Migrations nécessaires

| Migration | Contenu | Sprint |
|---|---|---|
| `20260515_unique_pending_batch_per_poste.ts` | Index unique applicatif batches | 1 |
| `20260515_add_call_type_to_unresolved.ts` | Colonne `call_type` sur `call_event_unresolved` | 2 |
| `20260515_add_last_alert_at_to_batch.ts` | Colonne `last_alert_at` sur `commercial_obligation_batch` | 2 |
| `20260515_unique_call_event_id_in_task.ts` | Index UNIQUE `call_event_id` sur `call_task` | 3 |

---

## Variables d'environnement à documenter

| Variable | Défaut actuel | Nouveau défaut | Raison |
|---|---|---|---|
| `ORDER_CALL_SYNC_LOOKBACK_MINUTES` | `2` | `10` | FIX-C1 — délais insertion DB2 |
| `ORDER_CALL_SYNC_BATCH_SIZE` | `200` | `100` | FIX-C3 — fenêtre stale réduite |
| `ORDER_CALL_DURATION_MS_THRESHOLD_SEC` | `86400` | `7200` | FIX-C5 — seuil ms/s robuste |
| `APP_TIMEZONE` | *(non défini)* | `Africa/Abidjan` | FIX-H3 — fuseau horaire explicite |

---

*Plan généré le 2026-05-15 — basé sur `RAPPORT_ATTRIBUTION_APPELS.md`*
