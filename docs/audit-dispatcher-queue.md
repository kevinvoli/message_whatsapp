# Analyse du Dispatcher & Queue

## Architecture globale

```
Message entrant → Webhook → Dispatcher → Queue (round-robin) → Agent via WebSocket
```

---

## Queue : Round-Robin FIFO

Le systeme utilise une file `QueuePosition` avec position numerique et un **Mutex** pour la concurrence.

| Operation | Logique |
|-----------|---------|
| `addPosteToQueue` | Ajoute en fin (max_position + 1) |
| `getNextInQueue` | Prend position=1, puis le renvoie en fin |
| `removeFromQueue` | Supprime + recalcule les positions en transaction |
| `syncQueueWithActivePostes` | Synchronise queue <-> agents actifs |

Pas de priorite, pas de ponderation par charge.

---

## Dispatcher : Logique d'assignation

4 cas dans `assignConversation()` :

1. **Chat existant + agent connecte** - Incremente `unread_count`, pas de reassignation
2. **Aucun agent dispo** - Retourne `null`, message **perdu**
3. **Chat existant + agent offline** - Reassigne via `getNextInQueue()`
4. **Nouveau chat** - Cree le chat, assigne au prochain agent

---

## Bugs identifies

### ~~BUG 1~~ - CORRIGE : Queue vide quand aucun agent connecte

**Probleme initial** : Quand le dernier agent se deconnectait, la queue etait vide et les messages arrivant etaient perdus.

**Correction appliquee** :
- `handleDisconnect` : quand le dernier agent part, `fillQueueWithAllPostes()` remet tous les postes non-bloques dans la queue
- `handleConnection` : quand un agent se connecte, `purgeOfflinePostes()` retire les postes offline de la queue
- Les messages sont dispatches en mode `OFFLINE` / `EN_ATTENTE` pendant les heures hors-service
- A la reconnexion, chaque agent recoit les conversations qui lui ont ete assignees

---

### ~~BUG 2~~ - COMPORTEMENT VOULU : Pas de reinjection a la deconnexion

**Analyse initiale** : Il semblait manquer une reinjection immediate quand un agent se deconnecte.

**Logique metier confirmee** : C'est le comportement attendu.
- Quand un agent se deconnecte, ses conversations restent assignees a lui
- La reassignation se fait au prochain message du client via `assignConversation()`
- Le dispatcher verifie `isAgentConnected(posteId)` (cas 1 vs cas 3)
- Si l'agent n'est pas connecte, la conversation est reassignee au prochain poste disponible

---

### ~~BUG 3~~ - CORRIGE : Race condition sur le dispatch concurrent

**Probleme** : Le Mutex protegeait la queue mais pas le dispatcher. Deux messages simultanes pouvaient obtenir le meme agent.

**Correction appliquee** : Ajout d'un `dispatchLock` (Mutex) dans `dispatcher.service.ts`. La methode `assignConversation()` est maintenant wrappee dans `dispatchLock.runExclusive()`, garantissant qu'un seul dispatch s'execute a la fois.

---

### ~~BUG 4~~ - CORRIGE : Multi-tenant bloque la connexion

**Probleme** : `resolveTenantIdForPoste` retournait `null` si 0 ou >1 tenants, deconnectant l'agent.

**Correction appliquee** :
- **0 tenants** (nouveau poste) : fallback sur le premier channel disponible via `channelService.ensureTenantId()`
- **>1 tenants** : selection du tenant le plus frequent parmi les chats du poste (avec warning log)

---

### ~~BUG 5~~ - CORRIGE : SLA peut avoir un delai de 10 min

**Probleme** : `setInterval` ne s'execute pas immediatement. Premier check SLA retarde de 5 minutes.

**Correction appliquee** : Ajout d'un appel immediat a `runCheck()` dans `startAgentSlaMonitor()` avant le `setInterval`. Les deadlines deja expirees sont traitees des la connexion de l'agent.

---

### ~~BUG 6~~ - CORRIGE : Pas d'equilibrage de charge

**Probleme** : Round-robin pur, pas de prise en compte de la charge.

**Correction appliquee** : `getNextInQueue()` utilise maintenant une strategie **least-loaded**. Parmi tous les postes en queue, il selectionne celui avec le moins de chats actifs (status ACTIF ou EN_ATTENTE). En cas d'egalite, l'ordre de queue (round-robin) fait office de departage.

---

## Modele de donnees cles

### WhatsappChat (champs lies au dispatch)

| Champ | Role |
|-------|------|
| `poste_id` | Agent assigne |
| `status` | ACTIF / EN_ATTENTE / FERME |
| `assigned_at` | Date d'assignation |
| `assigned_mode` | ONLINE / OFFLINE |
| `first_response_deadline_at` | Deadline SLA (5 min par defaut) |
| `last_client_message_at` | Dernier message client |
| `last_poste_message_at` | Derniere reponse agent |
| `unread_count` | Messages non lus |
| `read_only` | Verrouille apres 24h sans reponse |

### QueuePosition

| Champ | Role |
|-------|------|
| `poste_id` | Reference vers WhatsappPoste |
| `position` | Ordre dans la file (1-based) |

---

## Configuration

| Parametre | Valeur par defaut | Description |
|-----------|-------------------|-------------|
| `no_reply_reinject_interval_minutes` | 5 | Frequence du check SLA |
| `read_only_check_interval_minutes` | 10 | Frequence du check read-only |
| `offline_reinject_cron` | `0 9 * * *` | Reinjection quotidienne a 9h |

---

## Recommandations par priorite

| Priorite | Action |
|----------|--------|
| ~~P0~~ | ~~Queue vide sans agents~~ - CORRIGE (fillQueueWithAllPostes / purgeOfflinePostes) |
| ~~P0~~ | ~~Reinjection a la deconnexion~~ - COMPORTEMENT VOULU (reassignation au prochain message client) |
| ~~P1~~ | ~~Race condition dispatcher~~ - CORRIGE (dispatchLock Mutex) |
| ~~P1~~ | ~~Multi-tenant bloque connexion~~ - CORRIGE (fallback channel + tenant le plus frequent) |
| ~~P2~~ | ~~Delai SLA initial~~ - CORRIGE (premier tick immediat) |
| ~~P2~~ | ~~Pas de load balancing~~ - CORRIGE (strategie least-loaded) |

---

## Fichiers concernes

| Composant | Fichier |
|-----------|---------|
| Dispatcher | `src/dispatcher/dispatcher.service.ts` |
| Queue | `src/dispatcher/services/queue.service.ts` |
| Gateway | `src/whatsapp_message/whatsapp_message.gateway.ts` |
| Webhook Whapi | `src/communication_whapi/whapi.service.ts` |
| Ingestion unifiee | `src/webhooks/services/inbound-message.service.ts` |
| Job SLA | `src/dispatcher/jobs/first-response-timeout.job.ts` |
| Job reinjection offline | `src/dispatcher/jobs/offline-reinjection.job.ts` |
| Job read-only | `src/dispatcher/jobs/read-only-enforcement.job.ts` |
| Config dispatch | `src/dispatcher/entities/dispatch-settings.entity.ts` |
