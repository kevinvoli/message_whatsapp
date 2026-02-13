# CAHIER_DES_CHARGES_EVENTS_IA.md

Date: 2026-02-13
Public cible: IA de codage
Perimetre: protocoles d events backend/front/admin
Source: `BILAN_EVENTS_SUPPRESSION_CENTRALISATION.md`

## 1) Regles d execution
- Un ticket = un changement atomique, testable, rollbackable.
- Statuts autorises: `todo`, `in_progress`, `review`, `done`, `blocked`.
- A la fermeture d un ticket: renseigner `Date cloture`, `Preuve`, `Fichiers modifies`.

## 2) Tableau global des tickets
| ID | Etape | Titre | Statut |
|---|---|---|---|
| TKT-EVT-S1-001 | S1 | Supprimer `contact:get` cote front | done |
| TKT-EVT-S1-002 | S1 | Supprimer listeners/front cases morts (`message:status:update`, `CONVERSATION_REASSIGNED`, `AUTO_MESSAGE_STATUS`) | done |
| TKT-EVT-S2-001 | S2 | Ajouter emissions backend `contact:event` -> `CONTACT_UPSERT` | done |
| TKT-EVT-S2-002 | S2 | Ajouter emissions backend `contact:event` -> `CONTACT_REMOVED` | done |
| TKT-EVT-S2-003 | S2 | Ajouter emissions backend `contact:event` -> `CONTACT_CALL_STATUS_UPDATED` | done |
| TKT-EVT-S2-004 | S2 | Implementer consommation front de tous les types `contact:event` | done |
| TKT-EVT-S3-001 | S3 | Migrer backend typing vers `chat:event` (`TYPING_START`, `TYPING_STOP`) | done |
| TKT-EVT-S3-002 | S3 | Migrer front listeners typing vers `chat:event` | done |
| TKT-EVT-S3-003 | S3 | Supprimer emissions/listeners legacy `typing:start`/`typing:stop` | done |
| TKT-EVT-S4-001 | S4 | Creer vue admin Queue consommant `queue:updated` | done |
| TKT-EVT-S4-002 | S4 | Exposer metriques d etat queue dans la vue admin | done |
| TKT-EVT-S5-001 | S5 | Documenter matrice officielle des events | done |
| TKT-EVT-S5-002 | S5 | Ajouter tests E2E/protocole events critiques | done |

## 3) Plan par etape

## Etape S1 - Nettoyage events morts

### TKT-EVT-S1-001 - Supprimer `contact:get` cote front
- Statut: `done`
- Objectif: retirer emit sans handler backend.
- Cibles:
  - `front/src/store/contactStore.ts`
- Taches:
  1. Supprimer `socket.emit('contact:get', ...)`.
  2. Verifier qu aucune fonctionnalite ne depend de cet emit.
- Acceptance:
  - Plus aucun `contact:get` dans le front.
- Date cloture: 2026-02-13
- Preuve: suppression de l'emit `contact:get` dans le store contact.
- Fichiers modifies: `front/src/store/contactStore.ts`

### TKT-EVT-S1-002 - Supprimer listeners/front cases morts
- Statut: `done`
- Objectif: retirer branches non emises par backend.
- Cibles:
  - `front/src/components/WebSocketEvents.tsx`
- Taches:
  1. Supprimer `message:status:update` listener.
  2. Supprimer cases `CONVERSATION_REASSIGNED` et `AUTO_MESSAGE_STATUS`.
- Acceptance:
  - Aucun listener front non alimente par backend.
- Date cloture: 2026-02-13
- Preuve: suppression des cases `AUTO_MESSAGE_STATUS` et `CONVERSATION_REASSIGNED`, et du listener `message:status:update`.
- Fichiers modifies: `front/src/components/WebSocketEvents.tsx`

## Etape S2 - Enrichissement `contact:event`

### TKT-EVT-S2-001 - Backend `CONTACT_UPSERT`
- Statut: `done`
- Objectif: pousser creation/mise a jour contact en temps reel.
- Cibles:
  - `message_whatsapp/src/contact/*`
  - `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- Taches:
  1. Emettre `contact:event` type `CONTACT_UPSERT` sur create/update.
  2. Definir payload canonique contact.
- Acceptance:
  - Un contact cree/modifie est upsert instantanement cote front.
- Date cloture: 2026-02-13
- Preuve: emission `CONTACT_UPSERT` depuis le controller via le gateway.
- Fichiers modifies: `message_whatsapp/src/contact/contact.controller.ts`, `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`, `message_whatsapp/src/contact/contact.module.ts`

### TKT-EVT-S2-002 - Backend `CONTACT_REMOVED`
- Statut: `done`
- Objectif: synchroniser suppression contact.
- Cibles:
  - `message_whatsapp/src/contact/*`
- Taches:
  1. Emettre `CONTACT_REMOVED` avec `contact_id`.
- Acceptance:
  - Le contact disparait du front sans reload manuel.
- Date cloture: 2026-02-13
- Preuve: emission `CONTACT_REMOVED` apres suppression contact.
- Fichiers modifies: `message_whatsapp/src/contact/contact.controller.ts`, `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`, `message_whatsapp/src/contact/contact.module.ts`

### TKT-EVT-S2-003 - Backend `CONTACT_CALL_STATUS_UPDATED`
- Statut: `done`
- Objectif: pousser les changements d appel en temps reel.
- Cibles:
  - `message_whatsapp/src/contact/contact.controller.ts`
  - `message_whatsapp/src/contact/contact.service.ts`
- Taches:
  1. Emettre event apres `updateCallStatus`.
- Acceptance:
  - Changement statut appel visible instantanement sur front.
- Date cloture: 2026-02-13
- Preuve: emission `CONTACT_CALL_STATUS_UPDATED` apres update call status.
- Fichiers modifies: `message_whatsapp/src/contact/contact.controller.ts`, `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`, `message_whatsapp/src/contact/contact.module.ts`

### TKT-EVT-S2-004 - Front consumer multi-types `contact:event`
- Statut: `done`
- Objectif: un seul handler front pour tous types contacts.
- Cibles:
  - `front/src/components/WebSocketEvents.tsx`
  - `front/src/store/contactStore.ts`
- Taches:
  1. Gerer `CONTACT_LIST`, `CONTACT_UPSERT`, `CONTACT_REMOVED`, `CONTACT_CALL_STATUS_UPDATED`.
  2. Deduper/update local store proprement.
- Acceptance:
  - Etat contacts coherent sans refresh.
- Date cloture: 2026-02-13
- Preuve: handler `contact:event` gere `CONTACT_LIST`, `CONTACT_UPSERT`, `CONTACT_REMOVED`, `CONTACT_CALL_STATUS_UPDATED`.
- Fichiers modifies: `front/src/components/WebSocketEvents.tsx`, `front/src/store/contactStore.ts`

## Etape S3 - Centralisation typing dans `chat:event`

### TKT-EVT-S3-001 - Backend typing -> `chat:event`
- Statut: `done`
- Objectif: unifier protocole typing.
- Cibles:
  - `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- Taches:
  1. Emettre `chat:event` type `TYPING_START` / `TYPING_STOP`.
  2. Payload unique `{ chat_id, commercial_id? }`.
- Acceptance:
  - Plus d emissions metier typing hors `chat:event`.
- Date cloture: 2026-02-13
- Preuve: emission typing migree vers `chat:event` avec types `TYPING_START`/`TYPING_STOP`.
- Fichiers modifies: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

### TKT-EVT-S3-002 - Front typing via `chat:event`
- Statut: `done`
- Objectif: consommer typing dans le switch principal.
- Cibles:
  - `front/src/components/WebSocketEvents.tsx`
- Taches:
  1. Ajouter cases `TYPING_START` / `TYPING_STOP`.
  2. Retirer dependance listeners dedies.
- Acceptance:
  - Typing fonctionne en mode centralise.
- Date cloture: 2026-02-13
- Preuve: ajout des cases `TYPING_START` et `TYPING_STOP` dans le handler `chat:event`.
- Fichiers modifies: `front/src/components/WebSocketEvents.tsx`

### TKT-EVT-S3-003 - Nettoyage legacy typing
- Statut: `done`
- Objectif: finaliser suppression protocole precedent.
- Cibles:
  - backend + front fichiers socket
- Taches:
  1. Supprimer `socket.on('typing:start')` et `socket.on('typing:stop')` front.
  2. Supprimer emissions backend equivalentes dediees.
- Acceptance:
  - Aucun listener/emission typing legacy restant.
- Date cloture: 2026-02-13
- Preuve: suppression des listeners `typing:start/stop` et migration des emissions front vers `chat:event`.
- Fichiers modifies: `front/src/components/WebSocketEvents.tsx`, `front/src/store/chatStore.ts`, `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

## Etape S4 - Consommation admin de `queue:updated`

### TKT-EVT-S4-001 - Creer vue admin Queue
- Statut: `done`
- Objectif: consommer `queue:updated` en direct.
- Cibles:
  - `admin/src/app/ui/` (nouvelle vue)
  - `admin/src/app/dashboard/commercial/page.tsx`
- Taches:
  1. Creer `QueueView`.
  2. Brancher navigation admin sur cette vue.
- Acceptance:
  - L admin voit la queue en temps reel.
- Date cloture: 2026-02-13
- Preuve: ajout d'une vue `QueueView` connectee au socket `queue:updated`.
- Fichiers modifies: `admin/src/app/ui/QueueView.tsx`, `admin/src/app/dashboard/commercial/page.tsx`, `admin/src/app/data/admin-data.ts`, `admin/src/app/lib/definitions.ts`, `admin/package.json`

### TKT-EVT-S4-002 - Metriques queue dans vue admin
- Statut: `done`
- Objectif: rendre la vue exploitable ops.
- Cibles:
  - `admin/src/app/ui/QueueView.tsx`
- Taches:
  1. Afficher position, poste, actif/inactif, horodatage.
  2. Ajouter etats loading/error/reconnect.
- Acceptance:
  - Vue lisible en conditions incidentes.
- Date cloture: 2026-02-13
- Preuve: affichage position, poste, statut actif/inactif, horodatage + etats loading/reconnect.
- Fichiers modifies: `admin/src/app/ui/QueueView.tsx`

## Etape S5 - Documentation et qualite

### TKT-EVT-S5-001 - Matrice officielle des events
- Statut: `done`
- Objectif: documentation unique des contrats.
- Cibles:
  - `docs/` (nouveau fichier matrice)
- Taches:
  1. Lister event, sens, payload, emetteur, consommateur.
  2. Tagger events legacy/deprecated.
- Acceptance:
  - Une reference unique maintenable.
- Date cloture: 2026-02-13
- Preuve: creation de la matrice officielle des events socket.
- Fichiers modifies: `docs/events-matrix.md`

### TKT-EVT-S5-002 - Tests E2E protocole events
- Statut: `done`
- Objectif: prevenir regression protocole.
- Cibles:
  - `message_whatsapp/test/*`
  - tests front websocket ciblant events
- Taches:
  1. Couvrir `chat:event` centralise (message + typing).
  2. Couvrir `contact:event` multi-types.
  3. Couvrir `queue:updated` consumer admin.
- Acceptance:
  - Tests verts sur parcours critiques events.
- Date cloture: 2026-02-13
- Preuve: ajout de tests protocole pour emissions `contact:event` et `chat:event` typing.
- Fichiers modifies: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.spec.ts`

## 4) Ordre recommande
1. S1 (nettoyage)
2. S2 (contacts)
3. S3 (typing)
4. S4 (admin queue)
5. S5 (doc + tests)

## 5) Regle de suivi
A chaque ticket ferme:
- mettre a jour le statut dans le tableau global,
- renseigner date, preuve et fichiers modifies dans la section ticket.
