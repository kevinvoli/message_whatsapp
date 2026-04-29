# Rapport — Rotation des conversations & Obligations d'appel
*Analyse par l'équipe whatsapp-dev-team — 2026-04-29*

---

## PARTIE 1 — Fenêtre glissante (Rotation des conversations)

### 1.1 Objectif métier

Les commerciaux ne traitent que **10 conversations à la fois** (bloc actif). Les 40 autres restent verrouillées en file d'attente. Quand les 10 rapports GICOP du bloc actif sont soumis **et** les obligations d'appel remplies, une rotation libère les 10 conversations soumises et promeut les 10 suivantes.

### 1.2 Entités DB impliquées

| Entité | Table | Colonnes clés |
|---|---|---|
| `WhatsappChat` | `whatsapp_chat` | `window_slot` (int, 1–50), `window_status` (ACTIVE/LOCKED/RELEASED/VALIDATED), `is_locked` (legacy) |
| `ConversationValidation` | `conversation_validation` | `chat_id`, `criterion_type`, `is_validated`, `validated_at` |
| `ValidationCriterionConfig` | `validation_criterion_config` | `criterion_type`, `is_required`, `is_active` |
| `CallEvent` | `call_event` | `external_id`, `chat_id`, `call_status`, `duration_seconds`, `event_at` |

**Migration** : `Phase9SlidingWindow1745424000001`

### 1.3 Services et responsabilités

| Service | Rôle |
|---|---|
| `WindowRotationService` | Construction fenêtre, déclenchement rotation, compactage slots |
| `ValidationEngineService` | Suivi des critères par conversation, progression du bloc |
| `ConversationCapacityService` | Quotas (10 actif / 50 total), flag SLIDING_WINDOW_ENABLED |
| `CallObligationService` | Conditions d'appel bloquant la rotation |

### 1.4 Jobs cron

| Job | Fréquence | Rôle |
|---|---|---|
| `autoCheckRotations()` | Toutes les **1 min** | Vérifie si rotation prête pour chaque poste, auto-build fenêtres orphelines |
| `handleExternalCriterionTimeout()` | Toutes les **1h** | Auto-valide `call_confirmed` après `WINDOW_EXTERNAL_TIMEOUT_HOURS` |

### 1.5 Flux de rotation complet

```
① BUILD (login commercial)
   └─ buildWindowForPoste(posteId)
       → Slots 1–10  = ACTIVE  (conversations ouvertes)
       → Slots 11–50 = LOCKED  (file d'attente)
       → Init validations critères pour les ACTIVE
       → Crée batch obligations (15 appels requis)

② SOUMISSION RAPPORT (admin)
   └─ POST /messages/{chatId}/result
       → Événement conversation.result_set
       → ValidationEngineService.markCriterionMet(chatId, 'result_set')
       → Événement WINDOW_BLOCK_PROGRESS → WebSocket → BlockProgressBar frontend

③ VÉRIFICATION ROTATION (cron 1/min ou trigger immédiat)
   └─ checkAndTriggerRotation(posteId)
       → submitted < 10 ?  → attendre
       → FF_CALL_OBLIGATIONS_ENABLED = true ?
           → appels incomplets ?  → WINDOW_ROTATION_BLOCKED (call_obligations_incomplete)
           → qualité échouée ?    → WINDOW_ROTATION_BLOCKED (quality_check_failed)
       → tout OK → performRotation()

④ ROTATION (sous RedLock distribué 120s)
   └─ _executeRotation(posteId)
       → Libère les 10 ACTIVE soumises  → window_status = RELEASED, slot = null
       → Promeut LOCKED → ACTIVE        → réassigne slots 1–10
       → Injecte nouvelles conversations → slots 11–50
       → Reset statut soumission (évite faux positif bloc N+1)
       → Crée nouveau batch obligations
       → Émet WINDOW_ROTATED → WebSocket → animation slide-out frontend

⑤ COMPACTAGE (fermeture d'une conversation)
   └─ compactSlots(posteId)
       → Réassigne slots 1…N sans trous
       → Promeut LOCKED → ACTIVE si slot libéré
       → Injecte 1 nouvelle conversation si place
```

### 1.6 Feature flags

| Flag | Défaut | Rôle |
|---|---|---|
| `SLIDING_WINDOW_ENABLED` | `true` | Active la fenêtre glissante |
| `FF_CALL_OBLIGATIONS_ENABLED` | `true` | Bloque rotation si obligations incomplètes |
| `FF_GICOP_REPORT_REQUIRED` | `true` | Bloque clôture si rapport incomplet |

### 1.7 Événements WebSocket rotation

| Événement backend | Socket payload | Effet frontend |
|---|---|---|
| `WINDOW_ROTATED` | `releasedChatIds[], promotedChatIds[]` | Animation slide-out + rechargement liste |
| `WINDOW_BLOCK_PROGRESS` | `{submitted, total}` | Mise à jour `BlockProgressBar` |
| `WINDOW_ROTATION_BLOCKED` | `{reason, progress, obligations}` | Alerte blocage + tooltip ConversationItem |

### 1.8 Constantes système

| Paramètre | Valeur | Configurable |
|---|---|---|
| Quota actif (bloc) | **10** | ✅ `CAPACITY_QUOTA_ACTIVE` |
| Quota total (fenêtre) | **50** | ✅ `CAPACITY_QUOTA_TOTAL` |
| Timeout RedLock | 120s | ❌ Hardcodé |
| Timeout critère externe | 0h (désactivé) | ✅ `WINDOW_EXTERNAL_TIMEOUT_HOURS` |

---

## PARTIE 2 — Obligations d'appel E-GICOP

### 2.1 Objectif métier

Avant chaque rotation de fenêtre, le commercial doit prouver qu'il a appelé des clients de **3 catégories** (5 appels chacune = 15 au total) et que la **qualité des échanges est satisfaisante** (dernier message du poste, pas du client).

### 2.2 Entités DB impliquées

**DB1 (messagerie MySQL)**

| Entité | Table | Colonnes clés |
|---|---|---|
| `CommercialObligationBatch` | `commercial_obligation_batch` | `posteId`, `batchNumber`, `status` (PENDING/COMPLETE), `annuleeDone`, `livreeDone`, `sansCommandeDone`, `qualityCheckPassed` |
| `CallTask` | `call_task` | `batchId`, `posteId`, `category`, `status` (PENDING/DONE), `callEventId`, `durationSeconds`, `completedAt` |
| `ClientIdentityMapping` | `client_identity_mapping` | `external_id` (ID DB2), `contact_id` (UUID DB1) |
| `CommercialIdentityMapping` | `commercial_identity_mapping` | `external_id` (ID DB2), `commercial_id` (UUID DB1) |
| `OrderCallSyncCursor` | `order_call_sync_cursor` | `lastCallTimestamp`, `lastCallId`, `processedCount` |

**DB2 (commandes GICOP — lecture seule)**

| Entité | Table DB2 | Usage |
|---|---|---|
| `OrderCallLog` | `call_logs` | Source des appels téléphoniques |
| `OrderCommand` | `commandes` | Résolution catégorie client |
| `GicopUser` | `users` | Pont téléphone → ID client DB2 |

### 2.3 Catégories d'obligations

| Catégorie | ClientCategory mappée | Condition DB2 | Requis |
|---|---|---|---|
| `COMMANDE_ANNULEE` | `COMMANDE_ANNULEE` | `trueCancel = 1` | **5 appels** |
| `COMMANDE_AVEC_LIVRAISON` | `COMMANDE_AVEC_LIVRAISON` | `dateLivree IS NOT NULL` | **5 appels** |
| `JAMAIS_COMMANDE` | `JAMAIS_COMMANDE` + `COMMANDE_SANS_LIVRAISON` | Aucune commande ou non livrée | **5 appels** |

> **Total : 15 appels sortants ≥ 90 secondes**

### 2.4 Flux complet d'une obligation

```
① SYNC DB2 → DB1 (cron toutes les 5 min)
   └─ OrderCallSyncJob → OrderCallSyncService.syncNewCalls()
       → Lecture incrémentale call_logs DB2 (curseur timestamp + id tie-breaker)
       → Batch de 200 appels par exécution (BATCH_SIZE = 200)
       → Pour chaque appel sortant (callType = 'outgoing') ≥ 90s :
           → processCall()  → IntegrationSyncLog (PENDING)
           → matchObligation() :
               1. resolveClientCategory(idClient, remoteNumber)
                  ├─ idClient présent → requête commandes DB2 directe
                  └─ idClient absent  → lookup GicopUser par téléphone → commandes
                  Règle : trueCancel=1             → ANNULEE
                          dateLivree IS NOT NULL   → LIVRAISON
                          sinon                    → JAMAIS_COMMANDE
               2. CallObligationService.tryMatchCallToTask()
       → Avancement curseur (lastCallTimestamp, lastCallId)

② MATCHING OBLIGATION (tryMatchCallToTask)
   └─ Vérifications dans l'ordre :
       1. FF_CALL_OBLIGATIONS_ENABLED = true ?
       2. Durée ≥ 90s ?
       3. Résolution poste  (idCommercialDb2 → mapping → poste / fallback téléphone)
       4. Résolution catégorie (resolvedCategory > idClientDb2 > téléphone > JAMAIS_COMMANDE)
       5. Batch actif PENDING pour ce poste ?
       6. Idempotence : callEventId déjà utilisé ?
       7. Tâche PENDING disponible pour cette catégorie ?
       → Si tout OK : tâche DONE, compteur batch++, log SUCCESS

③ CONTRÔLE QUALITÉ (checkAndRecordQuality)
   └─ Pour chaque conversation ACTIVE du bloc :
       last_poste_message_at >= last_client_message_at ?
       → Tous OK : qualityCheckPassed = true
       → Au moins un KO : qualityCheckPassed = false
       → Sauvegardé sur le batch actif

④ ROTATION AUTORISÉE si :
   batch.annuleeDone >= 5
   && batch.livreeDone >= 5
   && batch.sansCommandeDone >= 5
   && batch.qualityCheckPassed = true
   → readyForRotation = true
```

### 2.5 Résolution catégorie client — pont DB1 ↔ DB2

```
IDs DB1 ≠ IDs DB2 — pont = numéro de téléphone ou table de mapping

Priorité de résolution (tryMatchCallToTask) :
  1. resolvedCategory passé explicitement depuis OrderCallSyncService (DB2)
  2. idClientDb2 → ClientIdentityMapping → contact DB1 → client_category
  3. clientPhone normalisé → Contact DB1 → client_category
  4. Défaut : JAMAIS_COMMANDE (non bloquant)

Résolution poste :
  1. posteId fourni directement
  2. idCommercialDb2 → CommercialIdentityMapping → commercial → poste
  3. commercialPhone → commercial DB1 → poste
  → Introuvable : CALL_OBLIGATION_REJECTED reason=poste_introuvable
```

### 2.6 Job de synchronisation

```
OrderCallSyncJob — @Cron('*/5 * * * *') — toutes les 5 minutes
├─ Guard in-process (flag running) — skip si déjà en cours
├─ Batch 200 appels par exécution (lecture incrémentale cursor)
├─ Idempotence : callEventId unique par tâche (OBL-008)
└─ IntegrationSyncLog : trace PENDING → SUCCESS / FAILED
```

### 2.7 Interface utilisateur

**Commercial (front/)**
- `ObligationProgressBar` — 3 segments : Annulées X/5 · Livrées X/5 · Sans commande X/5
- `ConversationItem` tooltip verrouillé — appels manquants par catégorie + rapports restants
- Alerte `WINDOW_ROTATION_BLOCKED` — raison + nombre d'appels manquants

**Admin (admin/)**
- `CallObligationsView` — tableau par poste : batchNumber, compteurs, qualité
- `GoNoGoView` — checklist flags + état crons (`FF_CALL_OBLIGATIONS_ENABLED`, `obligation-quality-check`)
- Endpoint debug : `GET /capacity/debug/:posteId` — état complet fenêtre + obligations

---

## PARTIE 3 — Interactions entre les deux systèmes

```
ROTATION BLOQUÉE SI :
  ┌─────────────────────────────────────────────────────────┐
  │  Rapports GICOP      : submitted < 10                   │ → attendre
  │  Obligations appels  : readyForRotation = false         │ → ROTATION_BLOCKED
  │  Qualité messages    : qualityCheckPassed = false        │ → ROTATION_BLOCKED
  └─────────────────────────────────────────────────────────┘

SÉQUENCE TYPIQUE D'UN BLOC :
  1. Rotation → 10 conv ACTIVE + batch obligations créé (15 tâches PENDING)
  2. Commercial appelle ses clients (sync DB2 toutes les 5min, match tâches)
  3. Commercial répond à tous les messages (qualité : dernier msg = poste)
  4. Admin soumet les 10 rapports GICOP
  5. checkAndTriggerRotation() → tout OK → rotation bloc suivant
```

---

## PARTIE 4 — Risques & Points d'amélioration

| # | Risque | Sévérité | Mitigation actuelle |
|---|---|---|---|
| 1 | **Latence sync DB2** : appels validés 0–5 min après l'appel réel | MOYEN | Cron 5min + cursor incrémental |
| 2 | **Race condition rotation** : deux triggers simultanés → RedLock skip → délai 1min | FAIBLE | Cron EVERY_MINUTE rattrape |
| 3 | **Résolution catégorie échoue** : téléphone absent → défaut JAMAIS_COMMANDE (fausse quotas) | MOYEN | Log détaillé + admin supervision |
| 4 | **RedLock crash** avant unlock → blocage 120s | FAIBLE | TTL 120s ; cron relance |
| 5 | **Flip `FF_CALL_OBLIGATIONS_ENABLED`** en prod → bascule immédiate sur toutes les rotations | ÉLEVÉ | Coordination métier obligatoire avant changement |
| 6 | **Pas d'UI admin dédiée fenêtre** : état slots visible uniquement via endpoint API debug | MOYEN | À prioriser pour supervision opérationnelle |
| 7 | **15 appels et 90s hardcodés** : non configurables en runtime | FAIBLE | À paramétrer si métier évolue |

---

*Rapport généré par l'équipe whatsapp-dev-team :*
- **system-designer** — Analyse fenêtre glissante (WindowRotationService, ValidationEngineService, WebSocket)
- **tech-lead** — Analyse obligations d'appel (CallObligationService, OrderCallSyncService)
