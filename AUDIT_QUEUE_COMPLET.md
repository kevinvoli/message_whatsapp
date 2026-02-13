# Audit Complet - File d'Attente (Queue)

Date: 2026-02-13  
Perimetre: backend `message_whatsapp`, admin `admin`, monitoring/observabilite

## 1) Constat - Backend

### 1.1 Gestion de la queue
- Service principal: `message_whatsapp/src/dispatcher/services/queue.service.ts`
- Entite: `message_whatsapp/src/dispatcher/entities/queue-position.entity.ts`
- Emission socket: `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Observations:
- `addPosteToQueue` ajoute un poste en fin de queue si absent.
- `removeFromQueue` effectue la suppression + reindexation en transaction, mais le lock `queueLock` est desactive (commentaire). Risque de concurrence si plusieurs appels simultanes.
- `getNextInQueue` applique un verrou `queueLock` et appelle `moveToEnd`, mais `moveToEnd` appelle `removeFromQueue` qui n'est pas protegee par lock (commentaire), ce qui expose a des races entre `removeFromQueue` et `getNextInQueue`.
- `syncQueueWithActivePostes` supprime/ajoute en bulk mais sans transaction globale, risque d'etat transitoire incoherent.
- La queue ne contient pas d'etat explicite (ex: raison d'entree/sortie, horodatage d'activation, cause de desactivation).

### 1.2 Integration dispatcher
- `DispatcherService.assignConversation` utilise `getNextInQueue`, puis reaffecte ou cree la conversation.
- L'assignation repose sur l'event de presence agent dans `WhatsappMessageGateway.handleConnection` / `handleDisconnect`.
- Si la connexion socket est instable, la queue peut subir des ajouts/suppressions rapides sans throttling.

### 1.3 Emission `queue:updated`
- Emission globale via `WhatsappMessageGateway.emitQueueUpdate` (broadcast a tous).
- Le payload est `QueuePosition[]` avec relations `poste`.
- Pas d'horodatage de l'emission ni versioning (diff updates).

## 2) Constat - Admin UI

### 2.1 Vue admin Queue
- `admin/src/app/ui/QueueView.tsx` ecoute `queue:updated` via socket.
- Affiche position, poste, statut actif, horodatages.

Observations:
- La vue n'a pas d'auth socket explicite (repose sur cookie).
- Pas de fallback REST si le socket est indisponible.
- Pas de filtre/tri, pas d'indicateur de backlog global, pas de densite d'agent actif/inactif.
- Affiche `addedAt` et `updatedAt` mais les conversions de dates se basent sur `toLocaleString` sans timezone affichee.

### 2.2 Navigation
- Navigation admin expose la vue `queue` dans `admin/src/app/data/admin-data.ts`.

## 3) Constat - Monitoring / Observabilite

Observations:
- Logs existants mais non standardises (messages informels et emojis).
- Pas de metriques de queue (taille, temps moyen en queue, churn, taux de reassignment).
- Pas d'alerting (ex: queue vide prolongement, backlog eleve, agents inactifs).

## 4) Ecarts / Risques

Critique:
- Risque de concurrence dans `removeFromQueue` (lock desactive) pouvant causer des positions dupliquees ou des trous.
- Race possible entre `getNextInQueue` et `syncQueueWithActivePostes`.

Eleve:
- Emission `queue:updated` globale sans ciblage ni throttling -> surcharge potentielle en cas d'instabilite socket.
- Admin UI depend uniquement du socket -> indisponible si WS down.

Moyen:
- Absence de metrics/alerting -> diagnostic lent en cas d'incident de repartition.
- Pas de trace standardisee des transitions queue (ajout/suppression/assignation).

## 5) Recommandations

1. Re-activer le verrou sur `removeFromQueue` et garantir l'atomicite de `moveToEnd`.
2. Ajouter un endpoint REST `GET /queue` pour fallback admin.
3. Emettre un payload `queue:updated` enrichi (timestamp, reason).
4. Ajouter metriques (taille queue, temps moyen en queue, churn, taux de reassignment).
5. Ajouter alertes: queue vide prolongement, backlog > seuil, agents inactifs.

## 6) Conclusion

Le flux de queue fonctionne mais reste fragile face aux concurrences et manque d'observabilite. L'effort prioritaire doit etre la fiabilisation de la concurrence (locks/transactions) et la visibilite (metrics + fallback admin).
