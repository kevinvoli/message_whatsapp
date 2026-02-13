# AUDIT DISPATCH COMPLET

Date: 2026-02-13
Contexte: Analyse complete du "dispatch" (assignation de conversations, gestion de queue, events socket, jobs, metriques) du backend `message_whatsapp`.

## 1) Perimetre analyse
- Dispatcher: `message_whatsapp/src/dispatcher/*`
- Queue: `message_whatsapp/src/dispatcher/services/queue.service.ts`
- Gateway: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- Entites: `queue_positions`, `pending_messages`, `whatsapp_chat`
- Webhook: `message_whatsapp/src/whapi/whapi.service.ts`
- Jobs: `message_whatsapp/src/jorbs/*` (SLA, offline reinjection, 24h)
- Metriques: `message_whatsapp/src/metriques/*`

## 2) Cartographie des flux

### 2.1 Flux entrant (Webhook -> Dispatch)
1. `WhapiService.handleIncomingMessage`
   - Verifie payload + ignore `from_me` + valide `chat_id`.
   - Appelle `DispatcherService.assignConversation(chat_id, from_name)`.
   - Si pas d'agent dispo, log + return.
   - Sauvegarde message + medias.
   - Emet socket via `WhatsappMessageGateway.notifyNewMessage`.

### 2.2 Assignation (DispatcherService)
- `assignConversation`:
  - Recherche conversation existante.
  - Si conversation + poste connecte => incr unread + status + last_activity => save.
  - Sinon getNextInQueue() => affecte au poste suivant.
  - Si conversation existante => reassigne et met `assigned_*` + SLA.
  - Si nouvelle conversation => cree chat, assigne poste, SLA.

- `dispatchExistingConversation`:
  - Deplace un chat vers poste suivant dans la queue.
  - Emet un event socket `CONVERSATION_ASSIGNED` / `CONVERSATION_REMOVED`.

- `reinjectConversation`:
  - Nettoie l'assignation puis relance `dispatchExistingConversation`.

### 2.3 Connexion/Deconnexion (Gateway)
- `handleConnection`:
  - Valide token, recupere commercial + poste.
  - Join rooms, marque commercial/poste actifs.
  - Si queue active => `addPosteToQueue` + `syncQueueWithActivePostes`.
  - Start SLA monitor.
  - Emit `queue:updated` + push conversations/contacts.

- `handleDisconnect`:
  - Marque commercial/poste inactifs.
  - `removeFromQueue`.
  - Stop SLA monitor.
  - Emit `queue:updated`.

### 2.4 Queue (QueueService)
- Mutex `queueLock` assure operations atomiques.
- `addPosteToQueueInternal`: skip si poste bloque.
- `removeFromQueueInternal`: transaction => retire poste et decremente positions.
- `getNextInQueue`: prend le 1er puis `moveToEnd`.
- `syncQueueWithActivePostes`: aligne queue avec postes actifs + non bloques.
- `resetQueueState`: vide queue + passe tous postes inactifs + commerciaux offline.
- `blockPoste`/`unblockPoste`:
  - Met flag is_queue_enabled + remove/add queue.

### 2.5 Jobs
- `first-response-timeout.job.ts`:
  - Monitor SLA, mais logique commentee (jobRunner tick sans action).
- `offline-reinjection.job.ts`:
  - Cron quotidien 09:00, logique de reinjection commentee.
- `whatsapp-24h.job.ts`:
  - Marque chats read_only apres 24h d'inactivite client.

### 2.6 Metriques
- `metriques.service.ts` expose metriques de queue + alertes (backlog, empty).

## 3) Inventaire des composants

### 3.1 Services
- `DispatcherService` (assignation, reinjection, reassignation).
- `QueueService` (gestion de queue, sync, block/unblock, reset).
- `WhatsappMessageGateway` (events socket, queue updates, connection state).

### 3.2 Entites
- `queue_positions`: position, poste_id, timestamps.
- `pending_messages`: non utilise dans le flux principal (placeholder).
- `whatsapp_chat`: champs dispatch `assigned_at`, `assigned_mode`, `first_response_deadline_at`, `last_*`.

### 3.3 API
- `GET /queue` (admin)
- `POST /queue/reset` (admin)
- `POST /queue/block/:posteId` (admin)
- `POST /queue/unblock/:posteId` (admin)

## 4) Points positifs
- Verrouillage queue (mutex + transactions) => integrite.
- Separation claire: assignation vs socket vs queue.
- Flag `is_queue_enabled` + blocage admin.
- Reset backend au boot pour resoudre crash backend.
- Events socket enrichis (timestamp/reason).

## 5) Risques / Fragilites detectees

### 5.1 Comportement queue/dispatch
- `resetQueueState` est declenche au boot => tous les postes deviennent inactifs.
  - Risque: besoin d'une reconnexion de chaque agent apres reboot backend.
- `checkAndInitQueue` ajoute tous les postes si aucun actif (mais n'est pas appele).
- `getNextInQueue` log "message mis en attente" meme si next existe (log trompeur).

### 5.2 SLA / Reinjection
- SLA et reinjection sont inactifs (code commente).
- Pas de strategie de retry/reinjection quand un poste ne repond pas.

### 5.3 PendingMessage
- Entite `PendingMessage` non exploitee, pas de file d'attente messages client.
- Risque de perte de messages non dispatches (pas de persistence en attente).

### 5.4 Coherence statuts
- Assignation d'une conversation existante set `status = EN_ATTENTE` meme si agent online.
- Pas de controle explicite sur `read_only`/`waiting_client_reply` dans le dispatch.

### 5.5 Observabilite
- Logs riches mais pas de correlation id stable sur dispatch (traceId uniquement webhook).
- Metriques queue ok, pas de metriques dispatch (temps assignation, taux reassign).

### 5.6 Tests
- Tests unitaires minimalistes, pas de tests integration sur dispatch.

## 6) Manques fonctionnels
- Politique d'assignation avancée (priorites, charge, statut commercial).
- Gestion d'overflow (sauver message en attente quand queue vide).
- Reprise automatique apres crash backend (re-hydration queue depuis DB + verif connexions socket).
- Admin: pas de vue dispatch detaillee (etats, SLA, stuck chats).

## 7) Recommandations (niveau haut)
- Activer / implementer SLA reinjection (deadline + task runner).
- Clarifier statut conversation: actif/en attente selon assignation.
- Ajouter file `pending_messages` dans le flux (persist message inbound si pas d'agent).
- Ajouter metriques dispatch (SLA breach, temps assign).
- Standardiser logs dispatch (trace/dispatch_id).
- Ajouter tests e2e dispatch + queue.

## 8) Liste des fichiers clefs
- `message_whatsapp/src/dispatcher/dispatcher.service.ts`
- `message_whatsapp/src/dispatcher/services/queue.service.ts`
- `message_whatsapp/src/dispatcher/dispatcher.controller.ts`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- `message_whatsapp/src/whapi/whapi.service.ts`
- `message_whatsapp/src/dispatcher/entities/queue-position.entity.ts`
- `message_whatsapp/src/dispatcher/entities/pending-message.entity.ts`
- `message_whatsapp/src/jorbs/*.job.ts`
- `message_whatsapp/src/metriques/metriques.service.ts`
