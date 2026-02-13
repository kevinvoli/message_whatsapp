# CAHIER_DES_CHARGES_QUEUE_IA.md

Date: 2026-02-13  
Public cible: IA de codage  
Perimetre: backend queue, admin UI queue, monitoring
Source: `AUDIT_QUEUE_COMPLET.md`

## 1) Regles d'execution
- Un ticket = un changement atomique, testable, rollbackable.
- Statuts autorises: `todo`, `in_progress`, `review`, `done`, `blocked`.
- A la fermeture d'un ticket: renseigner `Date cloture`, `Preuve`, `Fichiers modifies`.

## 2) Tableau global des tickets
| ID | Etape | Titre | Statut |
|---|---|---|---|
| TKT-QUEUE-S1-001 | S1 | Reactiver lock sur `removeFromQueue` et rendre `moveToEnd` atomique | done |
| TKT-QUEUE-S1-002 | S1 | Protections concurrence sur `syncQueueWithActivePostes` | done |
| TKT-QUEUE-S1-003 | S1 | Ajouter tests unitaires concurrence queue | done |
| TKT-QUEUE-S2-001 | S2 | Ajouter endpoint REST `GET /queue` | done |
| TKT-QUEUE-S2-002 | S2 | Fallback admin sur REST si WS down | done |
| TKT-QUEUE-S2-003 | S2 | Enrichir payload `queue:updated` (timestamp, reason) | done |
| TKT-QUEUE-S3-001 | S3 | Ajouter metriques queue (taille, temps, churn) | done |
| TKT-QUEUE-S3-002 | S3 | Ajouter alertes backlog/queue vide | done |
| TKT-QUEUE-S3-003 | S3 | Logs structurels pour transitions queue | done |

## 3) Plan par etape

## Etape S1 - Fiabilite concurrence

### TKT-QUEUE-S1-001 - Reactiver lock + `moveToEnd` atomique
- Statut: `done`
- Objectif: eviter les incoherences de position en concurrence.
- Cibles:
  - `message_whatsapp/src/dispatcher/services/queue.service.ts`
- Taches:
  1. Reactiver `queueLock.runExclusive` dans `removeFromQueue`.
  2. Encapsuler `moveToEnd` dans un verrou unique.
- Acceptance:
  - Pas de positions dupliquees ni de trous apres operations concurrentes.
- Date cloture: 2026-02-13
- Preuve: `removeFromQueue` et `moveToEnd` executes sous lock unique.
- Fichiers modifies: `message_whatsapp/src/dispatcher/services/queue.service.ts`

### TKT-QUEUE-S1-002 - Protections concurrence `syncQueueWithActivePostes`
- Statut: `done`
- Objectif: eviter les etats transitoires incoherents.
- Cibles:
  - `message_whatsapp/src/dispatcher/services/queue.service.ts`
- Taches:
  1. Executer sync sous lock ou transaction.
  2. Garantir idempotence.
- Acceptance:
  - Sync stable meme sous appels simultanes.
- Date cloture: 2026-02-13
- Preuve: `syncQueueWithActivePostes` protege par `queueLock`.
- Fichiers modifies: `message_whatsapp/src/dispatcher/services/queue.service.ts`

### TKT-QUEUE-S1-003 - Tests concurrence queue
- Statut: `done`
- Objectif: prevenir regressions de concurrence.
- Cibles:
  - `message_whatsapp/src/dispatcher/services/queue.service.spec.ts` (ou nouveau spec)
- Taches:
  1. Tester `add/remove/moveToEnd` en parallele.
- Acceptance:
  - Tests verts et deterministes.
- Date cloture: 2026-02-13
- Preuve: ajout de tests unitaires verifiant l'usage du lock.
- Fichiers modifies: `message_whatsapp/src/dispatcher/services/queue.service.spec.ts`

## Etape S2 - Admin + Protocoles

### TKT-QUEUE-S2-001 - Endpoint REST `GET /queue`
- Statut: `done`
- Objectif: fournir un fallback admin.
- Cibles:
  - `message_whatsapp/src/dispatcher/*`
- Taches:
  1. Exposer endpoint.
  2. Retourner `QueuePosition[]` avec poste.
- Acceptance:
  - Appel REST retourne la queue ordonnee.
- Date cloture: 2026-02-13
- Preuve: ajout d'un controller `GET /queue`.
- Fichiers modifies: `message_whatsapp/src/dispatcher/dispatcher.controller.ts`, `message_whatsapp/src/dispatcher/dispatcher.module.ts`

### TKT-QUEUE-S2-002 - Fallback admin REST
- Statut: `done`
- Objectif: continuer l'affichage si WS indisponible.
- Cibles:
  - `admin/src/app/ui/QueueView.tsx`
  - `admin/src/app/lib/api.ts`
- Taches:
  1. Ajouter `getQueue()` REST.
  2. Charger REST sur erreur socket ou au mount.
- Acceptance:
  - La vue s'affiche sans WS.
- Date cloture: 2026-02-13
- Preuve: ajout de `getQueue()` et chargement REST au mount.
- Fichiers modifies: `admin/src/app/lib/api.ts`, `admin/src/app/ui/QueueView.tsx`

### TKT-QUEUE-S2-003 - Enrichir payload `queue:updated`
- Statut: `done`
- Objectif: observabilite et debugging.
- Cibles:
  - `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- Taches:
  1. Ajouter `timestamp` et `reason` dans payload.
  2. Adapter admin a ce format.
- Acceptance:
  - Admin affiche la source et l'horodatage.
- Date cloture: 2026-02-13
- Preuve: payload enrichi avec `timestamp` et `reason`, admin adapte.
- Fichiers modifies: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`, `admin/src/app/ui/QueueView.tsx`

## Etape S3 - Monitoring

### TKT-QUEUE-S3-001 - Metriques queue
- Statut: `done`
- Objectif: mesurer charge et performance.
- Cibles:
  - `message_whatsapp/src/metriques/*` (ou nouveau module)
- Taches:
  1. Exposer taille queue, temps moyen, churn.
- Acceptance:
  - Metriques lisibles et exploitables.
- Date cloture: 2026-02-13
- Preuve: endpoint `api/metriques/queue` + calcul taille/age/churn.
- Fichiers modifies: `message_whatsapp/src/metriques/metriques.service.ts`, `message_whatsapp/src/metriques/metriques.controller.ts`, `message_whatsapp/src/metriques/metriques.module.ts`, `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`

### TKT-QUEUE-S3-002 - Alertes
- Statut: `done`
- Objectif: signaler anomalies.
- Cibles:
  - `message_whatsapp/src/metriques/*` ou `logging/*`
- Taches:
  1. Alerte backlog > seuil.
  2. Alerte queue vide anormalement.
- Acceptance:
  - Logs d'alerte visibles.
- Date cloture: 2026-02-13
- Preuve: alerts `empty_queue` et `high_backlog` dans metrics queue.
- Fichiers modifies: `message_whatsapp/src/metriques/metriques.service.ts`

### TKT-QUEUE-S3-003 - Logs structurels
- Statut: `done`
- Objectif: tracer les transitions.
- Cibles:
  - `message_whatsapp/src/dispatcher/services/queue.service.ts`
- Taches:
  1. Logs JSON standardises (event, poste_id, action, position).
- Acceptance:
  - Logs parsables pour monitoring.
- Date cloture: 2026-02-13
- Preuve: logs `QUEUE_EVENT` standardises pour add/remove/move/sync.
- Fichiers modifies: `message_whatsapp/src/dispatcher/services/queue.service.ts`

## 4) Ordre recommande
1. S1 (fiabilite concurrence)
2. S2 (admin + protocole)
3. S3 (monitoring)

## 5) Regle de suivi
A chaque ticket ferme:
- mettre a jour le statut dans le tableau global,
- renseigner date, preuve et fichiers modifies.
