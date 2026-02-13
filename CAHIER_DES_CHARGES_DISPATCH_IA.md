# CAHIER DES CHARGES DISPATCH (IA CODAGE)

Base: `AUDIT_DISPATCH_COMPLET.md`
Date: 2026-02-13
Objectif: Stabiliser et fiabiliser le dispatch complet (queue, assignation, reinjection, observabilite, tests).

## Regles generales
- Chaque ticket doit etre autonome et testable.
- Les tickets sont ordonnes par dependances (pas par priorite).
- Status possibles: `todo`, `in_progress`, `done`, `blocked`.

---

## Etape S1 — Normalisation et garde-fous

### TKT-DISP-S1-001 (done)
**Titre:** Corriger les logs trompeurs dans `getNextInQueue`
**Objectif:** Eviter un log "message mis en attente" quand un poste est disponible.
**Definition of Done:**
- Log clair si `next` null vs non-null.
- Test unitaire simple ou verification manuelle.

### TKT-DISP-S1-002 (done)
**Titre:** Ajouter une verification `read_only` dans le dispatch
**Objectif:** Ne pas reassigner/assigner une conversation `read_only`.
**Definition of Done:**
- `assignConversation` ignore ou retourne null si chat read_only.
- Pas d'emission socket pour chat read_only.

### TKT-DISP-S1-003 (done)
**Titre:** Harmoniser statut conversation lors de reassignation
**Objectif:** Eviter `EN_ATTENTE` si agent actif.
**Definition of Done:**
- Definir regle claire (ex: ONLINE => ACTIF, OFFLINE => EN_ATTENTE).
- Applique dans `assignConversation` et `dispatchExistingConversation`.

---

## Etape S2 — Pending Messages (queue inbound)

### TKT-DISP-S2-001 (done)
**Titre:** Persister les messages entrants quand aucun agent dispo
**Objectif:** Utiliser `PendingMessage` pour stocker les messages non dispatches.
**Definition of Done:**
- Lors de `assignConversation` => si null, creer `PendingMessage`.
- Lien vers `conversationId` ou `chat_id` + contenu + type.

### TKT-DISP-S2-002 (done)
**Titre:** Job de reprise PendingMessage
**Objectif:** Dispatcher les pending messages quand queue redevenue dispo.
**Definition of Done:**
- Cron/worker qui tente dispatch des messages WAITING.
- Marque status DISPATCHED.

### TKT-DISP-S2-003 (done)
**Titre:** Metriques PendingMessage
**Objectif:** Ajouter metriques backlog et age.
**Definition of Done:**
- Metriques dans `metriques.service.ts` + DTO.

---

## Etape S3 — Reinjection & SLA

### TKT-DISP-S3-001 (done)
**Titre:** Activer `jobRunnertcheque` SLA
**Objectif:** Reinjecter les conversations si pas de reponse avant deadline.
**Definition of Done:**
- Retirer le code commente.
- `FirstResponseTimeoutJob` declenche reinjection.

### TKT-DISP-S3-002 (done)
**Titre:** Reinjecter offline quotidien
**Objectif:** Reactiver `offline-reinjection.job`.
**Definition of Done:**
- Condition "poste jamais connecte aujourd'hui" active.
- Reassignation reelle via dispatcher.

### TKT-DISP-S3-003 (done)
**Titre:** Audit SLA sur assignation
**Objectif:** Verifier que `first_response_deadline_at` est toujours coherent.
**Definition of Done:**
- Deadline set sur creation + reassignation.
- Tests unitaires ou assertions.

---

## Etape S4 — Observabilite & Tests

### TKT-DISP-S4-001 (done)
**Titre:** Ajouter un identifiant de trace dispatch
**Objectif:** Relier webhook -> assignation -> socket.
**Definition of Done:**
- `dispatch_id` ou `trace_id` propague dans logs.

### TKT-DISP-S4-002 (done)
**Titre:** Tests integration dispatch
**Objectif:** Couvrir assignation, queue, reinjection.
**Definition of Done:**
- Scenarios: queue vide, queue active, poste bloque, reassignation.

---

## Etape S5 — Admin / Monitoring

### TKT-DISP-S5-001 (done)
**Titre:** Exposer une vue admin dispatch
**Objectif:** Voir chats en attente, SLA, pending messages.
**Definition of Done:**
- Endpoint admin + UI simple.

---

## Historique
- Document genere automatiquement a partir de `AUDIT_DISPATCH_COMPLET.md`.


