# Rapport exhaustif — Processus de Dispatch WhatsApp

**Date** : 2026-04-07  
**Scope** : Toutes les règles d'assignation, de réassignation, de connexion/déconnexion et de gestion de la queue

---

## 1. Vue d'ensemble

Le système de dispatch est un orchestrateur qui gère l'assignation des conversations WhatsApp aux commerciaux (postes). Il s'articule autour de trois composants :

1. **Queue System** (`queue.service.ts`) — file d'attente des postes disponibles
2. **Dispatcher** (`dispatcher.service.ts`) — logique de décision pour assigner/réassigner
3. **Gateway WebSocket** (`whatsapp_message.gateway.ts`) — synchronisation temps réel

---

## 2. Flux global d'un message entrant

```
MESSAGE CLIENT ARRIVE (webhook)
    ↓
validateChatId()  →  rejet si groupe ou format invalide
    ↓
Mutex.runExclusive(chat_id)  →  sérialisation par conversation
    ↓
assignConversation()
    ├→ read_only && status != FERME  →  levée verrou, dispatch normal
    ├→ read_only && status == FERME  →  réouverture conversation
    ├→ read_only && EN_ATTENTE       →  unread_count+1 seulement, RETURN
    ├→ agent connecté sur bon poste  →  Cas 1 : unread_count+1, RETURN
    ├→ resolvePosteForChannel()
    │       ├→ canal dédié           →  retourner poste dédié (même offline)
    │       └→ pas de dédié          →  getNextInQueue() (least-loaded)
    ├→ aucun poste dispo             →  Cas 2 : EN_ATTENTE, poste_id=NULL
    ├→ conversation existante        →  Cas 3 : réassignation
    └→ nouvelle conversation         →  Cas 4 : création + assignation
    ↓
saveIncomingFromUnified()
    - unread_count += 1
    - read_only = false
    - last_client_message_at = NOW()
    ↓
emitNewMessage()  →  MESSAGE_ADD + CONVERSATION_UPSERT
    ↓
[Si première fois] autoMessageOrchestrator.handleClientMessage()
```

---

## 3. Détail de chaque cas dans `assignConversation()`

### Cas 0 — Conversation en lecture seule (`read_only`)

**Condition** : `conversation.read_only = true && status = EN_ATTENTE`  
**Action** : `unread_count += 1`, `last_activity_at = NOW()`, RETURN sans redispatch  
**Raison** : La conversation est déjà en attente d'un message client — elle est verrouillée

**Condition** : `conversation.read_only = true && status != FERME`  
**Action** : `read_only = false`, passe au dispatch normal  

**Condition** : `conversation.read_only = true && status = FERME`  
**Action** : `read_only = false`, `status = ACTIF`, redispatch (réouverture)

---

### Cas 1 — Conversation existante + agent connecté sur le bon poste

**Conditions** :
- Conversation existe en BDD
- `isAgentConnected(conversation.poste_id)` = vrai

**Champs BDD modifiés** :
```
unread_count     += 1
last_activity_at  = NOW()
status            = ACTIF (si était FERME)
last_client_message_at = NOW()
first_response_deadline_at = NOW() + 5 min  (si NULL et last_poste_message_at IS NULL)
```

**Socket émis** : `CONVERSATION_UPSERT` → room `poste:{posteId}`  
**Résultat** : Pas de redispatch, l'agent actuel garde la conversation

---

### Cas 2 — Aucun agent disponible (queue vide)

**Condition** : `resolvePosteForChannel()` retourne `null`

**Champs BDD si conversation existante** :
```
poste     = NULL
poste_id  = NULL
status    = EN_ATTENTE
assigned_at = NULL
assigned_mode = NULL
first_response_deadline_at = NULL
unread_count += 1
last_client_message_at = NOW()
```

**Champs BDD si nouvelle conversation** : idem mais créée directement avec ces valeurs

**Notification** : création d'une notification admin "Conversation en attente — aucun agent disponible"

---

### Cas 3 — Conversation existante + réassignation

**Condition** : Agent assigné est déconnecté OU sur un poste différent du canal dédié

**Champs BDD modifiés** :
```
poste      = nextPoste
poste_id   = nextPoste.id
status     = nextPoste.is_active ? ACTIF : EN_ATTENTE
assigned_mode = nextPoste.is_active ? ONLINE : OFFLINE
assigned_at = NOW()
first_response_deadline_at = NOW() + 5 min
unread_count += 1
last_activity_at = NOW()
last_client_message_at = NOW()
```

**Socket émis** : `CONVERSATION_UPSERT` → nouveau poste

---

### Cas 4 — Nouvelle conversation + agent disponible

**Condition** : Conversation inexistante + `getNextInQueue()` retourne un poste

**Champs BDD à la création** :
```
chat_id   = clientPhone
poste_id  = nextPoste.id
status    = nextPoste.is_active ? ACTIF : EN_ATTENTE
assigned_mode = ONLINE ou OFFLINE
assigned_at = NOW()
first_response_deadline_at = NOW() + 5 min
unread_count = 1
last_client_message_at = NOW()
```

**Socket émis** : `CONVERSATION_ASSIGNED` → nouveau poste

---

## 4. Résolution du poste : `resolvePosteForChannel()`

```
SI channelId fourni :
    posteId = WhapiChannel(channelId).poste_id
    SI posteId existe :
        RETOURNER poste dédié (même s'il est OFFLINE)
    SINON :
        LOG warn "Poste dédié introuvable, fallback queue globale"

RETOURNER getNextInQueue()
```

**Règle clé** : Un canal dédié envoie TOUJOURS ses conversations vers le même poste, y compris offline. Pas de fallback automatique sur la queue globale sauf si le poste dédié est introuvable en BDD.

---

## 5. Queue globale : `getNextInQueue()`

**Stratégie** : Least-loaded (poste avec le moins de conversations actives)

**Étapes** :
1. Fetch tous les `QueuePosition` triés par `position ASC`
2. Exclut les postes ayant au moins un canal dédié (mode exclusif)
3. Compte les conversations `status IN [ACTIF, EN_ATTENTE]` par poste
4. Sélectionne le poste avec le compte minimal
5. Déplace ce poste à la fin de la queue (round-robin pour les égalités)

**Retourne** : Le poste sélectionné, ou `null` si queue vide

---

## 6. Connexion d'un agent : `handleConnection()`

**Étapes** :

1. Extrait le JWT (header ou cookie), vérifie la signature
2. Récupère `commercialId` du payload JWT
3. Si le commercial n'a pas de poste → déconnexion immédiate
4. Résout les `tenantIds` du poste (via les conversations existantes ou les canaux)
5. Marque le commercial comme connecté (`isConnected = true`)
6. Active le poste (`is_active = true`)
7. Si `is_queue_enabled` :
   - `purgeOfflinePostes(posteId)` → retire tous les postes offline de la queue
   - `addPosteToQueue(posteId)` → ajoute ce poste en fin de queue
8. Démarre le monitor SLA pour ce poste (`startAgentSlaMonitor`)
9. Émet `queue:updated` (raison : `agent_connected`)
10. Rejoint les rooms : `tenant:{tenantId}` (pour chaque tenant) + `poste:{posteId}`
11. Envoie toutes les conversations du poste au client (`sendConversationsToClient`)

**`sendConversationsToClient`** :
- `findByPosteId(posteId)` — fetch toutes les conversations du poste
- Filtre par tenantIds
- Émet `CONVERSATION_LIST` directement au socket du client

---

## 7. Déconnexion d'un agent : `handleDisconnect()`

**Étapes** :

1. Vérifie si c'est le **dernier socket connecté** pour ce poste :
   ```
   isPosteStillActive = connectedAgents.some(agent => agent.posteId === posteId)
   ```

2. **Si le poste est maintenant inactif** :
   - `is_active = false`
   - `removeFromQueue(posteId)`
   - `stopAgentSlaMonitor(posteId)`
   - Crée une notification admin si des conversations actives existent

3. **Si la queue est maintenant vide** :
   - `fillQueueWithAllPostes()` → recharge la queue avec les postes offline
   - Raison : continuer le dispatch même sans agent en ligne
   - Exclus : postes sans commerciaux

4. Émet `queue:updated` (raison : `agent_disconnected`)

**Cas spécial — 2 commerciaux sur le même poste** : Si commercial A se déconnecte mais commercial B est encore connecté sur le même poste, `is_active` reste `true` et la queue n'est pas modifiée.

---

## 8. Réponse d'un agent (message sortant) : `createAgentMessage()`

### Validation préalable dans le gateway (`handleSendMessage`) :
- `chat.status == FERME` → erreur "conversation fermée"
- `last_client_message_at < NOW() - 23h` → erreur "fenêtre 23h expirée"
- Déduplication : `tempId + chat_id` et `pendingKey = chat_id:text` (TTL 1.5s)

### Champs BDD modifiés après envoi réussi :
```
unread_count          = 0        ← l'agent a "lu" en composant
last_poste_message_at = NOW()    ← timestamp de la réponse
read_only             = true     ← verrouille en attente du prochain message client
last_activity_at      = NOW()
```

**Sockets émis** :
- `MESSAGE_ADD` → room `poste:{posteId}`
- `CONVERSATION_UPSERT` → room `poste:{posteId}`

---

## 9. Gestion de `read_only`

| Valeur | Mis par | Condition |
|--------|---------|-----------|
| `true` | `createAgentMessage()` | Agent envoie un message avec succès |
| `false` | `InboundMessageService` | Message client arrive dans la conversation |
| `false` | `ReadOnlyEnforcementJob` | Avant fermeture automatique (24h) |
| `false` | `assignConversation()` | Réouverture après client réagit |

---

## 10. Gestion de `unread_count`

| Opération | Valeur | Déclencheur |
|-----------|--------|-------------|
| Message client entrant | `+= 1` | `assignConversation()` |
| Agent répond | `= 0` | `createAgentMessage()` |
| Agent marque comme lus | `= 0` | `handleMarkAsRead()` |

---

## 11. Gestion de `first_response_deadline_at`

| Valeur | Contexte | Déclencheur |
|--------|----------|-------------|
| `NOW() + 5 min` | Dispatch initial ou réassignation inbound | `assignConversation()` cas 1/3/4 |
| `NOW() + 15 min` | Réassignation SLA | `dispatchExistingConversation()` |
| `NOW() + 30 min` | Canal dédié ou poste seul (pas de redispatch) | `reinjectConversation()` |
| `NULL` | Avant réinjection, ou EN_ATTENTE sans poste | `reinjectConversation()` + cas 2 |

---

## 12. Réinjection SLA : `reinjectConversation()`

**Déclencheur** : Cron `sla-checker` quand `first_response_deadline_at < NOW()`

**Gardes-fous** :

1. **`read_only = true`** → LOG warn, RETURN (pas de réinjection)
2. **Canal dédié détecté** → étend deadline à +30 min, RETURN (ne quitte JAMAIS son poste)
3. **Poste seul dans la queue** → étend deadline à +30 min, RETURN (pas d'alternative)

**Redispatch normal** :
```
UPDATE chat SET :
    poste     = NULL
    poste_id  = NULL
    status    = EN_ATTENTE
    assigned_mode = NULL
    assigned_at = NULL
    first_response_deadline_at = NULL

APPEL dispatchExistingConversation(chat)
```

---

## 13. Réassignation SLA : `dispatchExistingConversation()`

**Déclencheur** : Appelé par `reinjectConversation()` après nettoyage du poste

**Gardes-fous** :
- `read_only = true` → RETURN
- `!chat.poste_id` → RETURN (orphelin géré par offline-reinjection)

**Si aucun agent disponible** :
```
emitConversationRemoved(chat.chat_id, oldPoste)
RETURN
```

**Si agent trouvé** :
```
UPDATE chat SET :
    poste     = nextPoste
    poste_id  = nextPoste.id
    assigned_mode = nextPoste.is_active ? ONLINE : OFFLINE
    status    = nextPoste.is_active ? ACTIF : EN_ATTENTE
    assigned_at = NOW()
    first_response_deadline_at = NOW() + 15 min  ← plus long pour éviter les boucles

emitConversationReassigned(oldPoste.id, nextPoste.id)
    → CONVERSATION_REMOVED vers ancien poste
    → CONVERSATION_ASSIGNED vers nouveau poste
```

---

## 14. Dispatch orphelin : `dispatchOrphanConversation()`

**Déclencheur** : Cron `offline-reinjection` sur conversations `poste_id IS NULL`

```
nextPoste = getNextInQueue()
SI !nextPoste :
    LOG warn "Aucun agent pour orphelin"
    RETURN

UPDATE chat SET :
    poste     = nextPoste
    poste_id  = nextPoste.id
    assigned_mode = nextPoste.is_active ? ONLINE : OFFLINE
    status    = nextPoste.is_active ? ACTIF : EN_ATTENTE
    assigned_at = NOW()
    first_response_deadline_at = NOW() + 5 min

emitConversationAssigned(chat.chat_id)
```

---

## 15. Différences entre les 3 méthodes de dispatch

| Méthode | Déclencheur | Cible | Deadline |
|---------|-------------|-------|----------|
| `assignConversation()` | Message client entrant (webhook) | Toute conversation | +5 min |
| `dispatchExistingConversation()` | Après `reinjectConversation()` (cron SLA) | Conversation sans poste après réinjection | +15 min |
| `dispatchOrphanConversation()` | Cron offline-reinjection | `poste_id IS NULL` depuis création | +5 min |

---

## 16. Crons correctifs

### 16.1 sla-checker (toutes les 120 min, inactif 21h–5h)

**Cible** :
```sql
status IN ('EN_ATTENTE', 'ACTIF')
AND unread_count > 0
ORDER BY last_activity_at ASC
LIMIT 50
```

**Action** : Pour chaque conversation avec `first_response_deadline_at < NOW()` → `reinjectConversation()`

**Rapport** : `"X conversation(s) réinjectée(s) sur Y ciblée(s)"`

---

### 16.2 offline-reinjection (09:00 quotidien)

**Partie 1 — postes offline** :
```sql
status = 'ACTIF'
AND last_poste_message_at IS NULL
AND poste.is_active = false
```
Action : `reinjectConversation()`

**Partie 2 — orphelins** :
```sql
poste_id IS NULL
AND status IN ('ACTIF', 'EN_ATTENTE')
AND read_only = false
```
Action : `dispatchOrphanConversation()`

**Rapport** : `"X réinjectée(s) hors-ligne, Y orpheline(s) dispatché(s)"`

---

### 16.3 read-only-enforcement (toutes les 60 min)

**Cible** (seuil configurable, défaut 24h) :
```sql
status != 'FERME'
AND (
    last_poste_message_at < (NOW() - seuil)
    OR (last_poste_message_at IS NULL AND createdAt < (NOW() - seuil))
)
```

**Action** :
```
status    = FERME
read_only = false
emitConversationClosed(chat)
```

**Rapport** : `"X conversation(s) fermée(s) automatiquement"`

---

## 17. Événements Socket.io

| Événement | Room cible | Déclencheur |
|-----------|------------|-------------|
| `CONVERSATION_LIST` | Client direct | Connexion agent |
| `CONVERSATION_UPSERT` | `poste:{id}` | Message entrant/sortant, status change |
| `CONVERSATION_ASSIGNED` | `poste:{id}` | Nouvelle assignation |
| `CONVERSATION_REMOVED` | `poste:{id}` | Aucun agent dispo après réinjection |
| `CONVERSATION_REASSIGNED` | Ancien + nouveau poste | Redispatch SLA |
| `MESSAGE_ADD` | `poste:{id}` | Message entrant ou sortant |
| `MESSAGE_STATUS_UPDATE` | `poste:{id}` | Webhook status (delivered/read/failed) |
| `queue:updated` | `poste:{id}` | Connect/disconnect agent, redispatch |
| `TYPING_START/STOP` | `poste:{id}` | Agent tape/arrête |
| `TOTAL_UNREAD_UPDATE` | Client direct | Mark as read, message entrant |

---

## 18. Scénario complet — Exemple demandé

> *Un commercial répond à une conversation, se déconnecte, un autre se connecte, un nouveau message arrive pendant que la conversation est sur un poste offline*

**État initial** :
- Conversation C assignée au Poste A (`status = ACTIF`)
- Commercial X sur Poste A a répondu → `last_poste_message_at = NOW()`, `read_only = true`

**Étape 1 : Commercial X se déconnecte**
```
handleDisconnect(commercialX)
→ isPosteStillActive(A) = false (plus de socket pour A)
→ posteService.setActive(A, false)  → is_active = false
→ queueService.removeFromQueue(A)
→ notification admin "Commercial déconnecté — 1 conv. active"
→ SI queue vide : fillQueueWithAllPostes()  → Poste B (offline) entre dans la queue
→ emitQueueUpdate('agent_disconnected')
```

**Conversation C à ce stade** : toujours assignée au Poste A (`poste_id = A`), `status = ACTIF`, `read_only = true`

---

**Étape 2 : Commercial Y se connecte sur Poste B**
```
handleConnection(commercialY)
→ commercialService.updateStatus(Y, true)
→ posteService.setActive(B, true)
→ purgeOfflinePostes(B)  → retire Poste A (offline) de la queue
→ addPosteToQueue(B)
→ startAgentSlaMonitor(B)
→ sendConversationsToClient()  → envoie CONVERSATION_LIST du Poste B uniquement
→ emitQueueUpdate('agent_connected')
```

**Conversation C à ce stade** : toujours sur Poste A, NON envoyée à Commercial Y (différent poste)

---

**Étape 3 : Nouveau message client arrive dans Conversation C**
```
webhook → InboundMessageService.handleMessages()
→ validateChatId() ✅
→ Mutex.runExclusive(chatId_C)

assignConversation(chatId_C)
→ Charge conversation C (poste_id = A, read_only = true, status = ACTIF)
→ read_only = true && status != FERME
    → read_only = false  ← levée du verrou
    → Passe au dispatch normal

→ isAgentConnected(A) = false  (A est offline)
→ Cas 3 : Réassignation

→ resolvePosteForChannel()
    SI canal dédié au Poste A : retourne Poste A (offline, EN_ATTENTE)
    SINON : getNextInQueue() → Poste B (seul dans la queue)

[Sans canal dédié] → nextPoste = Poste B

UPDATE conversation C :
    poste_id  = B
    status    = ACTIF  (B.is_active = true)
    assigned_mode = ONLINE
    assigned_at = NOW()
    first_response_deadline_at = NOW() + 5 min
    unread_count += 1
    read_only = false
    last_client_message_at = NOW()

→ emitConversationUpsert(C) → room poste:B  ← Commercial Y reçoit la conversation
```

**Conversation C à ce stade** : assignée au Poste B, `status = ACTIF`, visible pour Commercial Y

---

**Étape 4 : Sauvegarde du message et notification**
```
saveIncomingFromUnified(message, conversationC)
→ Crée WhatsappMessage en BDD
→ UPDATE conversation C : read_only = false, last_client_message_at = NOW()

emitNewMessage()
→ MESSAGE_ADD → room poste:B
→ CONVERSATION_UPSERT → room poste:B
```

**Commercial Y voit** : la conversation C avec le nouveau message, `unread_count = 1`

---

## 19. Angles morts identifiés

| ID | Situation | Durée blocage | Gravité |
|----|-----------|---------------|---------|
| AM#1 | `unread_count = 0` → SLA checker ignore (commercial lit sans répondre) | ~24h | 🔴 CRITIQUE |
| AM#2 | Orphelins non redispatchés entre 9h et 9h lendemain | ~24h | 🟠 HAUTE |
| AM#3 | Canal dédié offline → attente infinie, aucun fallback | ∞ | 🟠 HAUTE |
| AM#4 | Poste seul dans la queue → boucle SLA passive | passif | 🟡 MOYENNE |
| AM#5 | Créations minuit–5h sans redispatch actif | ~9h | 🟡 MOYENNE |
| AM#6 | `read_only = true` sur EN_ATTENTE → incrémente unread mais pas de dispatch | manuel | 🟠 HAUTE |

---

## 20. Champs BDD de référence (`whatsapp_chat`)

| Champ | Rôle | Mis à jour par |
|-------|------|----------------|
| `poste_id` | Poste assigné (NULL = orphelin) | dispatch, reinject, cron |
| `status` | ACTIF / EN_ATTENTE / FERME | dispatch, cron, user |
| `assigned_at` | Timestamp de la dernière assignation | dispatch |
| `assigned_mode` | ONLINE / OFFLINE | dispatch |
| `first_response_deadline_at` | Deadline SLA pour réponse agent | dispatch (5 ou 15 min), reinject (30 min) |
| `last_client_message_at` | Dernier message reçu du client | webhook inbound |
| `last_poste_message_at` | Dernier message envoyé par l'agent | outbound success |
| `read_only` | true = attente client, false = attente agent | outbound (→true), inbound (→false) |
| `unread_count` | Nb messages non lus par l'agent | inbound (+1), outbound (=0), mark-read (=0) |
| `channel_id` | Canal sur lequel est arrivé le dernier message | inbound |
