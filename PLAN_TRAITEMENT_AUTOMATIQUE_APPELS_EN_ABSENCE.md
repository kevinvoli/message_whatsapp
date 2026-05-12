# Plan — Traitement Automatique des Appels en Absence

**Date :** 2026-05-12  
**Contexte :** Plateforme messagerie E-GICOP (NestJS + TypeORM + MySQL + Next.js)  
**Objectif :** Quand un client appelle et que personne ne répond, la plateforme crée automatiquement une tâche de rappel prioritaire pour le commercial du poste, escalade si non traité dans les temps, et clôture automatiquement la tâche dès qu'un appel sortant vers ce même numéro est détecté après la date de l'appel en absence.

> **Contrainte :** Aucun message automatique ne doit être envoyé au client.

---

## Flux principal (cas nominal)

```
1. Client appelle le poste → appel non répondu
         │
         ▼
2. Appel en absence détecté (WhatsApp ou DB2)
   → Infos stockées : clientPhone, posteId, commercialId, occurredAt
   → Tâche prioritaire créée pour le commercial du poste
   → Commercial voit "Rappeler CLIENT (+212...) — Appel manqué à 14h32"
         │
         ▼
3. Commercial rappelle le client depuis son téléphone
         │
         ▼
4. Sync DB2 détecte un nouvel appel sortant (call_type='outgoing')
   → Vérification :
       a. Le numéro appelé (remoteNumber) = clientPhone de l'appel en absence ?
       b. L'appel sortant s'est produit APRÈS occurredAt de l'appel en absence ?
       c. L'appel en absence est toujours en statut non traité (pending/assigned) ?
         │
    (si a + b + c = true)
         ▼
5. Appel en absence marqué comme traité
   → status = 'called_back'
   → callbackDoneAt = timestamp de l'appel sortant
   → CommercialActionTask associée → status = 'done'
   → Délai de traitement calculé et enregistré
```

---

## État des lieux

### Ce qui existe déjà

| Composant | État |
|---|---|
| Détection WhatsApp `type='missed_call'` → `CommercialActionTask` | ✅ Fonctionne |
| Sync DB2 `call_type='missed'` → stockage `CallEvent` | ✅ Fonctionne |
| File d'actions commerciaux (`action-queue`) avec priorité 90 | ✅ Fonctionne |
| Attribution des appels au bon poste/commercial | ✅ Fonctionne |
| Matching appels sortants ≥ 90s → obligations GICOP | ✅ Fonctionne |

### Ce qui manque

1. **Pas de délai maximum** imposé pour traiter un appel en absence
2. **Pas d'escalade** si le commercial ne rappelle pas dans les temps
3. **Le rappel sortant** n'est pas explicitement lié à l'appel en absence entrant
4. **Pas de vue admin** dédiée au suivi des appels en absence (taux de traitement, délais)

---

## Vue d'ensemble du flux cible

```
Client appelle le poste
        │
        ▼
  Appel non répondu
        │
        ├─── Source A : WhatsApp (Whapi webhook)
        │         type='missed_call' → WhatsappMessage
        │
        └─── Source B : DB2 call_logs
                  call_type='missed' → sync 30s

                        │ (convergent vers)
                        ▼
          ┌───────────────────────────────┐
          │     MissedCallHandlerService   │
          │                               │
          │  Stocke MissedCallEvent :     │
          │  - clientPhone (normalisé)    │
          │  - occurredAt                 │
          │  - posteId / commercialId     │
          │  - deviceId (si DB2)          │
          └───────────────────────────────┘
                        │
                ┌───────┴────────────┐
                ▼                    ▼
          Tâche créée           status = 'assigned'
          CommercialActionTask
          priority = 90
          dueAt = now + 30min
                │
                ▼
  Commercial voit la tâche en top de file :
  "Rappeler +212... — Appel manqué à 14h32"
                │
    ┌───────────┴───────────────────────┐
    │                                   │
(rappelle dans les 30min)     (ne rappelle pas dans les 30min)
    │                                   │
    ▼                                   ▼
Appel sortant détecté          SLA breached → Escalade
par sync DB2 (30s)             superviseur notifié
    │
    ▼
onOutgoingCallDetected()
Vérification :
┌──────────────────────────────────────────┐
│  remoteNumber (normalisé)                │
│       == clientPhone (MissedCallEvent) ? │ → NON → ignoré
│                                          │
│  ET appel.occurredAt                     │
│       > missed.occurredAt ?              │ → NON → ignoré
│                                          │
│  ET missed.status IN                     │
│       ('pending','assigned') ?           │ → NON → ignoré
└──────────────────────────────────────────┘
    │ OUI (les 3 conditions)
    ▼
MissedCallEvent.status = 'called_back'
MissedCallEvent.callbackDoneAt = appel.occurredAt
MissedCallEvent.handlingDelaySeconds = calculé
CommercialActionTask.status = 'done'
onOutgoingCallDetected() retourne TRUE
    │
    ▼
Matching obligation GICOP → IGNORÉ
(un rappel d'appel en absence ne compte pas pour les obligations)
```

---

## Epics & User Stories

### Epic 1 — Normalisation et unification de la détection (P0)

**Objectif :** Les appels en absence provenant de WhatsApp et de DB2 sont traités par le même pipeline.

#### US1.1 — Entité `MissedCallEvent` unifiée

Créer une entité DB1 qui centralise les appels en absence quelle que soit leur source.
Elle stocke toutes les informations nécessaires pour retrouver plus tard l'appel sortant correspondant.

```typescript
// src/missed-calls/entities/missed-call-event.entity.ts
MissedCallEvent {
  id: UUID (PK)

  // ── Identification de l'appel en absence ──────────────────────────────
  source: ENUM { 'whatsapp', 'db2' }
  externalId: string              // chat_id WhatsApp OU external_id DB2 — UNIQUE INDEX
  occurredAt: Date                // timestamp exact de l'appel manqué (borne de recherche)

  // ── Infos de l'appelant (client) ──────────────────────────────────────
  clientPhone: string             // numéro normalisé (+212XXXXXXXXX) — INDEX matching rappel
  clientName: string | null       // prénom/nom résolu via Contact (pour affichage)

  // ── Infos du destinataire (commercial/poste) ──────────────────────────
  posteId: UUID | null            // FK WhatsappPoste — INDEX (retrouver appels d'un poste)
  commercialId: UUID | null       // FK WhatsappCommercial (commercial du poste à ce moment)
  deviceId: string | null         // device_id DB2 si source='db2'

  // ── Tâche de rappel créée pour le commercial ─────────────────────────
  callbackTaskId: UUID | null     // FK CommercialActionTask

  // ── Résultat du traitement ────────────────────────────────────────────
  callbackDoneAt: Date | null         // timestamp de l'appel sortant qui a clôturé
  callbackCallEventId: string | null  // external_id DB2 de l'appel sortant (traçabilité)
  callbackDurationSeconds: int | null // durée du rappel effectué
  handlingDelaySeconds: int | null    // délai entre occurredAt et callbackDoneAt

  slaBreachedAt: Date | null      // quand le SLA a été dépassé sans rappel
  escalatedAt: Date | null        // quand escaladé au superviseur

  status: ENUM {
    'pending',       // détecté, tâche non encore créée
    'assigned',      // tâche créée et assignée au commercial
    'called_back',   // commercial a rappelé (appel sortant détecté)
    'escalated',     // SLA dépassé, superviseur notifié
    'closed'         // fermé sans action (24h écoulées)
  }

  createdAt: Date
  updatedAt: Date
}
```

**Index nécessaires :**
- `UNIQUE(externalId)` — idempotence
- `INDEX(clientPhone, status, occurredAt)` — matching rappel sortant (requête critique)
- `INDEX(posteId, status)` — file par poste
- `INDEX(commercialId, status)` — file par commercial

**Migration :** `CreateMissedCallEvent<timestamp>`

#### US1.2 — `MissedCallHandlerService`

Service central qui traite un appel en absence entrant et coordonne les autres epics.

```typescript
// src/missed-calls/missed-call-handler.service.ts
async handle(event: {
  source: 'whatsapp' | 'db2';
  externalId: string;
  clientPhone: string;
  posteId?: string;
  commercialId?: string;
  deviceId?: string;
  occurredAt: Date;
}): Promise<void>
```

**Listeners :**
- `@OnEvent('whatsapp.message.received')` — filtre `type='missed_call'`
- Appelé directement par `OrderCallSyncService` quand `call_type='missed'` à l'ingestion DB2

**Idempotence :** `INSERT IGNORE` sur `externalId` pour éviter les doublons lors de la sync DB2 (30s).

---

### Epic 2 — Tâche de rappel automatique (P0)

**Objectif :** Une tâche `CommercialActionTask` est automatiquement créée et assignée au bon commercial avec un délai de traitement imposé.

#### US2.1 — Création de la tâche de rappel

Dans `MissedCallHandlerService.handle()`, après création du `MissedCallEvent` :

```typescript
const task = await this.actionQueueService.createTask({
  source: 'missed_call',
  priority: 90,                              // top de file
  assignedPosteId: event.posteId,
  assignedCommercialId: event.commercialId,
  entityId: event.externalId,
  contactPhone: event.clientPhone,
  dueAt: new Date(Date.now() + MISSED_CALL_SLA_MINUTES * 60_000),
  notes: `Appel manqué le ${formatDate(event.occurredAt)}`,
});

await this.missedCallRepo.update(missedCallEvent.id, {
  callbackTaskId: task.id,
  status: 'assigned',
});
```

**SLA par défaut :** 30 minutes (configurable via `SystemConfig.MISSED_CALL_SLA_MINUTES`)

#### US2.2 — Affichage dans la file commerciale

La tâche `missed_call` est déjà affichée dans `ActionQueuePanel` (frontend). Enrichir l'affichage avec :
- Badge "Appel en absence" avec timer countdown jusqu'à `dueAt`
- Couleur orange → rouge quand < 5 minutes restantes
- Numéro client affiché, cliquable pour ouvrir la conversation WhatsApp si elle existe

---

### Epic 3 — SLA et escalade automatique (P1)

**Objectif :** Si le commercial ne rappelle pas dans le délai SLA, un superviseur est notifié et la tâche est escaladée.

#### US3.1 — Job SLA checker pour appels en absence

Nouveau cron toutes les 5 minutes : `MissedCallSlaJob`

```typescript
// src/missed-calls/missed-call-sla.job.ts
async run(): Promise<void> {
  const overdue = await this.missedCallRepo.find({
    where: {
      status: 'assigned',
      slaBreachedAt: IsNull(),
    }
  });

  for (const mc of overdue) {
    const task = await this.taskRepo.findOne({ where: { id: mc.callbackTaskId } });
    if (task?.dueAt && task.dueAt < new Date() && task.status === 'pending') {
      await this.missedCallRepo.update(mc.id, {
        slaBreachedAt: new Date(),
        status: 'escalated',
      });
      await this.escalate(mc);
    }
  }
}
```

#### US3.2 — Notification escalade superviseur

Quand SLA dépassé :
1. Créer une notification `NotificationService` de type `alert`
2. Émettre un événement `missed_call.sla_breached` via `EventEmitter2`

**Destinataires :** Admins/superviseurs configurés dans `SystemConfig.MISSED_CALL_ESCALATION_TARGETS`

#### US3.3 — Auto-fermeture des appels en absence anciens

Si un appel en absence reste sans action pendant plus de 24h → fermer automatiquement avec statut `closed`, log de raison `no_action_24h`.

---

### Epic 4 — Détection automatique du rappel et clôture (P0)

**Objectif :** Quand un appel sortant est détecté vers un numéro ayant eu un appel en absence non traité, la tâche est automatiquement clôturée. La détection repose sur deux critères : **correspondance du numéro** et **chronologie** (l'appel sortant doit être postérieur à l'appel en absence).

#### US4.1 — Méthode `onOutgoingCallDetected` dans `MissedCallHandlerService`

```typescript
// src/missed-calls/missed-call-handler.service.ts

async onOutgoingCallDetected(params: {
  callEventExternalId: string;  // external_id DB2 de l'appel sortant (traçabilité)
  posteId: string;              // poste du commercial qui appelle
  commercialId: string;
  clientPhone: string;          // numéro appelé (normalisé)
  occurredAt: Date;             // timestamp de l'appel sortant
  durationSeconds: number | null;
}): Promise<void> {

  // 1. Chercher un appel en absence non traité pour ce numéro ET ce poste,
  //    dont la date est ANTÉRIEURE à l'appel sortant.
  //    On prend le plus récent si plusieurs correspondent.
  const missed = await this.missedCallRepo.findOne({
    where: {
      clientPhone: params.clientPhone,         // même numéro client
      posteId: params.posteId,                 // même poste
      status: In(['pending', 'assigned']),     // pas encore traité
      occurredAt: LessThan(params.occurredAt), // appel sortant APRÈS l'appel manqué
    },
    order: { occurredAt: 'DESC' }, // le plus récent d'abord
  });

  if (!missed) return; // aucun appel en absence à clôturer

  // 2. Calculer le délai de traitement
  const handlingDelaySeconds = Math.round(
    (params.occurredAt.getTime() - missed.occurredAt.getTime()) / 1000
  );

  // 3. Clôturer l'appel en absence
  await this.missedCallRepo.update(missed.id, {
    status: 'called_back',
    callbackDoneAt: params.occurredAt,
    callbackCallEventId: params.callEventExternalId,
    callbackDurationSeconds: params.durationSeconds,
    handlingDelaySeconds,
  });

  // 4. Clôturer la CommercialActionTask associée
  if (missed.callbackTaskId) {
    await this.actionTaskRepo.update(missed.callbackTaskId, { status: 'done' });
  }

  this.logger.log(
    `MISSED_CALL_CLOSED missedId=${missed.id} clientPhone=${params.clientPhone} ` +
    `posteId=${params.posteId} delay=${handlingDelaySeconds}s`
  );

  // 5. Émettre un événement pour les stats
  this.eventEmitter.emit('missed_call.called_back', {
    missedCallId: missed.id,
    posteId: params.posteId,
    commercialId: params.commercialId,
    clientPhone: params.clientPhone,
    handlingDelaySeconds,
  });

  // Retourne true : l'appelant sait que cet appel sortant est un rappel
  // et doit exclure le matching obligation GICOP.
  return true;
}

// Signature complète avec valeur de retour :
// Retourne true si un appel en absence a été clôturé, false sinon.
// async onOutgoingCallDetected(...): Promise<boolean>
```

**Règles de matching :**

| Condition | Détail |
|---|---|
| `clientPhone` correspond | Numéro normalisé identique (format `+212XXXXXXXXX`) |
| `occurredAt` appel en absence < timestamp appel sortant | L'appel sortant doit être **postérieur** à l'appel manqué |
| `status IN ('pending', 'assigned')` | L'appel en absence n'est pas déjà clôturé |
| `posteId` correspond | Cible le poste du commercial qui rappelle |

**Cas limites :**
- Plusieurs appels en absence pour le même numéro → on clôture le plus récent uniquement
- Le commercial appelle un numéro sans appel en absence associé → ignoré silencieusement
- Appel sortant < 10s (décroché par erreur) → clôture quand même (la durée n'est pas un critère de clôture, seulement de comptage obligation GICOP)

#### US4.2 — Intégration dans `OrderCallSyncService`

Point d'injection dans le flux de sync DB2 existant :

```typescript
// src/order-call-sync/order-call-sync.service.ts
// Après createCallEvent() et résolution du commercial

if (call.callType === 'outgoing' && resolvedPosteId) {
  // Tenter de clôturer un appel en absence correspondant.
  // Si un appel en absence est clôturé → l'appel sortant est un rappel
  // et ne compte PAS pour les obligations GICOP.
  let isMissedCallCallback = false;
  try {
    isMissedCallCallback = await this.missedCallHandlerService.onOutgoingCallDetected({
      callEventExternalId: call.id,
      posteId: resolvedPosteId,
      commercialId: resolvedCommercialId,
      clientPhone: normalizePhone(call.remoteNumber),
      occurredAt: call.callTimestamp,
      durationSeconds: call.duration,
    });
  } catch (err) {
    this.logger.warn('onOutgoingCallDetected failed', err);
  }

  // Matching obligation GICOP : exclus si l'appel est un rappel d'appel en absence
  if (!isMissedCallCallback && call.duration >= MIN_DURATION_SEC) {
    await this.obligationService.tryMatchCallToTask({ ... });
  }
}
```

**Important :** Si l'appel sortant clôture un appel en absence, il **ne compte pas** pour les obligations GICOP. Les deux opérations sont mutuellement exclusives.

#### US4.3 — Normalisation des numéros de téléphone

Utiliser la fonction `normalizePhone()` déjà présente dans le codebase (gère `+212`, `0212`, `212`, `06...`, `07...`). Le `clientPhone` est normalisé à la création du `MissedCallEvent` et lors de chaque appel à `onOutgoingCallDetected`.

---

### Epic 5 — Dashboard admin (P2)

**Objectif :** Vue admin pour piloter la qualité du traitement des appels en absence.

#### US5.1 — Page `/admin/missed-calls`

Métriques affichées :
- Taux de traitement dans le SLA (global + par poste)
- Délai moyen de rappel
- Nombre d'appels escaladés / non traités
- Top postes en retard

Filtres : période, poste, commercial, statut

#### US5.2 — Tableau appels en absence en cours

Colonnes : client, heure appel, commercial assigné, statut, temps restant SLA, actions manuelles (réassigner, fermer)

#### US5.3 — Configuration

Interface pour modifier via `SystemConfig` :
- `MISSED_CALL_SLA_MINUTES` — délai max avant escalade (défaut 30)
- `MISSED_CALL_ESCALATION_TARGETS` — destinataires escalade (admins/superviseurs)
- `MISSED_CALL_AUTO_CLOSE_HOURS` — délai auto-fermeture sans action (défaut 24h)

---

## Architecture technique

### Nouveaux fichiers

```
src/missed-calls/
  entities/
    missed-call-event.entity.ts       ← US1.1
  missed-call-handler.service.ts      ← US1.2 + US4.1
  missed-call-sla.job.ts              ← US3.1
  missed-call.controller.ts           ← US5.1 (endpoints admin)
  missed-call.module.ts
  missed-call.service.ts              ← logique métier + stats
  __tests__/
    missed-call-handler.service.spec.ts

src/database/migrations/
  CreateMissedCallEvent<timestamp>.ts
```

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `src/order-call-sync/order-call-sync.service.ts` | Appel `handle()` pour `call_type='missed'` + `onOutgoingCallDetected()` pour rappels sortants |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | Émettre `whatsapp.missed_call` quand `type='missed_call'` reçu |
| `src/action-queue/action-queue.service.ts` | Exposer méthode `createTask()` publique |
| `front/src/components/sidebar/ActionQueuePanel.tsx` | Timer countdown sur tâches `missed_call` |
| `admin/src/app/(dashboard)/missed-calls/page.tsx` | Nouvelle page admin |

### Dépendances inter-services

```
MissedCallHandlerService
  ↓ dépend de :
  ├── ActionQueueService          (création tâche rappel)
  ├── NotificationService         (escalade)
  └── SystemConfigService         (SLA minutes, escalation targets)

MissedCallSlaJob
  ↓ dépend de :
  ├── MissedCallRepository        (lecture statuts)
  ├── CommercialActionTaskRepo    (vérification dueAt)
  └── MissedCallHandlerService    (escalade)

OrderCallSyncService (modifié)
  ↓ + dépend de :
  └── MissedCallHandlerService    (liaison rappel sortant)
```

---

## Règles métier

1. **Pas d'écriture en DB2** — le traitement des appels en absence est entièrement dans DB1
2. **Aucun message automatique au client** — interdit
3. **Idempotence** — chaque appel en absence ne génère qu'un seul `MissedCallEvent` et une seule tâche de rappel, même si le webhook arrive deux fois
4. **Le rappel d'un appel en absence ne compte PAS pour les obligations GICOP** — si `onOutgoingCallDetected` retourne `true` (un appel en absence est clôturé), le matching obligation est ignoré pour cet appel sortant
5. **Chronologie stricte** — un appel sortant ne clôture un appel en absence que s'il est postérieur à celui-ci

---

## Ordre de livraison recommandé

### Sprint 1 — Fondation + Clôture (P0)

| Tâche | Effort |
|---|---|
| Entité + migration `MissedCallEvent` (US1.1) | S |
| `MissedCallHandlerService` + listeners (US1.2) | M |
| Création tâche rappel avec SLA (US2.1) | S |
| Détection rappel sortant + clôture automatique (US4.1 + US4.2) | M |
| Timer countdown frontend ActionQueuePanel (US2.2) | S |

### Sprint 2 — SLA et escalade (P1)

| Tâche | Effort |
|---|---|
| `MissedCallSlaJob` + notification escalade (US3.1 + US3.2) | M |
| Auto-fermeture 24h (US3.3) | S |

### Sprint 3 — Dashboard admin (P2)

| Tâche | Effort |
|---|---|
| Page admin `/missed-calls` + métriques (US5.1 + US5.2) | L |
| Interface configuration SystemConfig (US5.3) | S |

**Légende :** S = < 2h · M = 2–4h · L = 4–8h

---

## Points de vigilance

- **Race condition DB2/WhatsApp** : un même appel en absence peut arriver via WhatsApp (quasi-immédiat) ET via DB2 (sync 30s). L'idempotence sur `externalId` dans `MissedCallEvent` gère ce cas — utiliser l'`external_id` DB2 quand connu, le `chat_id` WhatsApp sinon.
- **Volume** : si un commercial a beaucoup d'appels en absence en attente, la file action-queue peut être longue. Prévoir un tri par `dueAt` croissant et une pagination.
- **DB2 down** : si DB2 est indisponible lors de la sync, les appels `call_type='missed'` ne sont pas traités. Prévoir un retry au retour de DB2 via le mécanisme de cursor existant dans `OrderCallSyncService`.
- **Appel sortant non résolu** : si le commercial qui rappelle n'est pas résolu (device_id inconnu), `onOutgoingCallDetected` ne sera pas appelé et l'appel en absence restera `assigned` jusqu'à expiration du SLA.
