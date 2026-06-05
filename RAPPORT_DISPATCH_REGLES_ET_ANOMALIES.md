# Rapport — Système de Dispatch : Règles et Anomalies

**Date :** 2026-06-05  
**Branche :** production  
**Contexte :** Deux comportements anormaux observés en prod + cartographie complète des règles

---

## 1. Architecture générale du dispatch

Le dispatch est géré principalement par `DispatcherService.assignConversationInternal()`, appelé à chaque message entrant. Il est aussi déclenché par plusieurs jobs cron et événements agents.

### Pipeline d'un message entrant (simplifié)

```
Webhook Meta/Whapi
  └─► InboundMessageService.handleMessages()
        └─► [Mutex par chat_id, timeout 30s]
              ├─ dispatcherService.assignConversation()   ← POINT DE DISPATCH
              ├─ ChatSessionService.onClientMessage()
              ├─ whatsappMessageService.saveIncoming()
              ├─ chatService.update()                     ← met à jour last_client_message_at
              └─ gateway.notifyNewMessage()               ← socket vers frontend
```

> Le mutex sérialise les webhooks sur le même chat. **Deux messages simultanés** sur le même chat ne peuvent pas dispatcher en parallèle, mais chacun peut déclencher un re-dispatch séquentiel.

---

## 2. Règles de dispatch — les 4 cas

### Cas 1 — Conversation déjà assignée, agent connecté ✅

**Conditions :**
- `conversation.poste_id` est défini
- `messageGateway.isAgentConnected(poste_id) === true`
- Le canal n'est pas un canal dédié renvoyant vers un autre poste

**Action :** Pas de réassignation. Mise à jour simple :
- `unread_count += 1`
- `last_activity_at = NOW`
- `status = ACTIF` si était FERME (réouverture)
- Socket : `CONVERSATION_UPSERT`

---

### Cas 2 — Aucun agent disponible

**Conditions :**
- `resolvePosteForChannel()` retourne `null`
- Queue vide ou tous les postes sont offline/bloqués

**Action :**
- Conversation passe/reste `EN_ATTENTE`
- `poste_id` conservé ou null
- `assigned_mode = OFFLINE`
- `first_response_deadline_at = null`

---

### Cas 3 — Conversation existante, agent absent ⚠️

**Conditions :**
- Conversation existe mais `poste_id = null` OU agent non connecté

**Action :**
- `resolvePosteForChannel()` cherche un nouveau poste
- Si trouvé : réassignation immédiate
  - `poste_id = nextAgent.id`
  - `assigned_at = NOW`
  - `first_response_deadline_at = NOW + 5 min`
  - Socket : `CONVERSATION_UPSERT` (l'ancien poste perd la conv, le nouveau la reçoit)

> **C'est ici que se produit la majorité des re-dispatches involontaires.**

---

### Cas 4 — Nouvelle conversation

**Conditions :** Aucune conversation avec ce `chat_id`

**Action :**
- Créer la conversation
- Si agent disponible : assigner immédiatement (`ACTIF`, deadline 5 min)
- Sinon : `EN_ATTENTE`, `poste_id = null`
- Socket : `CONVERSATION_ASSIGNED`

---

### Cas spécial — Conversation verrouillée (`read_only = true`)

**Conditions :** `conversation.read_only === true`

**Action :**
- Si `status = FERME` : lever le verrou, retraiter normalement (réouverture)
- Sinon : ignorer le message (pas de dispatch, pas de notification agent)
  - `unread_count += 1` (compté en silencieux)
  - Retour immédiat

---

## 3. Sélection du prochain poste — `resolvePosteForChannel()`

### Priorité canal dédié

Si le canal entrant a un `poste_id` défini (`WhapiChannel.poste_id IS NOT NULL`) :
- Router **obligatoirement** vers ce poste, indépendamment de la queue
- Même si offline → `EN_ATTENTE` sur ce poste, pas de réassignation

### Queue globale (si pas de canal dédié)

**Mode round-robin (défaut) :**
1. Lire `queue_positions` trié par `position ASC`
2. Exclure les postes dédiés à un canal (via `SELECT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL`)
3. Retourner le premier ; le remettre en fin de queue (`moveToEnd`)

**Mode least-loaded :**
1. Même logique mais tri par `COUNT(chats actifs) ASC`
2. Choisir le poste avec le moins de conversations `ACTIF/EN_ATTENTE/FERME`

**Fallback (queue vide) :**
- Scanner tous les postes avec `is_queue_enabled = true`
- Exclure postes dédiés
- Choisir le moins chargé
- ⚠️ **Peut surcharger un poste offline** si tous les actifs sont dans la queue

### État de la queue (`queue_positions`)

| Événement | Action |
|-----------|--------|
| Agent se connecte (socket) | `purgeOfflinePostes()` + `addPosteToQueue()` |
| Agent se déconnecte (socket) | `removeFromQueue()` |
| Admin bloque un poste | `removeFromQueue()` |
| Admin débloque un poste | `addPosteToQueue()` |
| Démarrage serveur | `fillQueueWithAllPostes()` (postes actifs) |

---

## 4. Jobs et crons qui modifient l'assignation

| Job | Déclencheur | Conditions | Action |
|-----|-------------|-----------|--------|
| **sla-checker** | Cron 15 min (5h–21h) | `unread_count > 0` + `last_client_message_at < 20 min ago` | Rééquilibre charge (greedy), réassigne |
| **orphan-checker** | Cron (5h–21h) | `poste_id = NULL`, `status != FERME`, `read_only = false` | Dispatch orphelins (max 20 par run) |
| **offline-reinjection** | Cron 9h UTC + manuel | `poste.is_active = false`, `unread_count > 0` OU `poste_id = null` | Réinjecte vers poste actif |
| **read-only-enforcement** | Cron 30 min (5h–21h) | `session.auto_close_at < NOW`, `session.ended_at IS NULL` | Ferme la session (pas de re-dispatch) |
| **Webhook entrant** | Temps réel | À chaque message client | `assignConversation()` — peut réassigner |
| **Admin : redispatch-all** | Manuel | `status = EN_ATTENTE`, pas dédié, pas `read_only` | Réassigne toutes les convs en attente |
| **Admin : reset-stuck** | Manuel | `status = ACTIF`, `poste.is_active = false` | Passe ACTIF → EN_ATTENTE |

---

## 5. Anomalies observées — Analyse

### 🔴 Anomalie A : Commercial envoie un message → conversation re-dispatchée immédiatement

#### Description
Un commercial répond à un client. Le message part. Dans la foulée, la conversation change de poste ou revient en EN_ATTENTE.

#### Cause identifiée — Race condition SLA checker

Le **sla-checker** tourne toutes les 15 min et cible les conversations où :
```
unread_count > 0
AND last_client_message_at < NOW - 20min
```

**Scénario :**
1. Client envoie un message à T0 → `unread_count = 1`, `last_client_message_at = T0`
2. Commercial ouvre la conversation → `unread_count = 0`, mais **`markChatAsRead()` n'est pas appelé immédiatement dans tous les cas**
3. Le commercial rédige et envoie sa réponse à T0 + 22 min
4. **Entre T0+20min et T0+22min**, le sla-checker tourne et voit : `unread_count > 0` (si pas reset) + `last_client_message_at < 20 min ago` → **re-dispatch**
5. La réponse du commercial arrive sur l'ancienne conversation mais l'assignation a changé

#### Cause secondaire — Poste marqué offline pendant l'envoi

Si l'agent perd brièvement sa connexion socket pendant qu'il rédige :
1. `removeFromQueue()` est appelé (agent perçu offline)
2. Le webhook du message entrant suivant (ou le job orphan-checker) voit le poste offline
3. `assignConversationInternal()` entre dans le **Cas 3** → réassigne à un autre poste
4. L'agent se reconnecte et retrouve la conversation disparue

#### Code impliqué
- `sla-checker` : condition `unread_count > 0` non vérifiée après réponse
- `assignConversationInternal()` Cas 3 : vérifie `isAgentConnected()` en temps réel via socket, état fragile
- `markChatAsRead()` : doit être appelé dès que l'agent ouvre la conversation

---

### 🔴 Anomalie B : Conversation arrive sur un poste → immédiatement réattribuée à un autre

#### Description
Un message client arrive, est assigné au poste A, mais quelques secondes après, la conversation bascule vers le poste B.

#### Cause identifiée — Double dispatch par concurrence job/webhook

**Scénario 1 — Orphan checker + webhook simultanés :**
1. La conversation existe mais `poste_id = null` (état temporaire, ex : juste après un reset)
2. Le webhook entrant arrive → `assignConversation()` assigne au poste A via queue (round-robin)
3. Quasi-simultanément, l'**orphan-checker** tourne, voit `poste_id = null` (snapshot avant step 2) → `dispatchOrphanConversation()` assigne au poste B
4. Le dernier écrivain gagne → si le cron finit après le webhook, la conversation est sur B même si le webhook avait assigné A

**Scénario 2 — Canal dédié vs queue globale :**
1. Message arrive via `channel_id = X`
2. Le dispatcher résout d'abord la conversation sans trouver de canal dédié (bug de timing ou cache) → assigne via queue globale au poste A
3. Un job ou un second webhook résout correctement le canal X comme dédié au poste B → réassigne au poste B
4. L'agent A reçoit brièvement la conversation puis la perd

**Scénario 3 — Reconnexion d'agent pendant dispatch :**
1. La conversation est `EN_ATTENTE` (poste_id défini mais agent offline)
2. L'agent se reconnecte → `addPosteToQueue()` + `purgeOfflinePostes()`
3. Simultanément, un message client arrive → `assignConversation()` voit poste offline → Cas 3 → assigne au prochain de la queue (poste B)
4. L'agent A vient de se reconnecter mais la conv est déjà partie vers B

#### Code impliqué
- `orphan-checker` : utilise `take(20)` mais pas de lock global — peut confliter avec webhooks
- `dispatchOrphanConversation()` : pas de vérification que `poste_id` a été mis à jour entre la lecture et l'écriture
- `resolvePosteForChannel()` : le canal dédié est lu en base à chaque appel (pas de cache) — risque de lecture sale si FK non encore persistée

---

## 6. Tableau des champs critiques du dispatch

| Champ | Table | Mis à jour par | Risque |
|-------|-------|----------------|--------|
| `poste_id` | `whatsapp_chat` | dispatcher, reinject, orphan | Peut être écrasé par plusieurs jobs simultanés |
| `status` | `whatsapp_chat` | dispatcher, sla-checker, enforcement | `ACTIF → EN_ATTENTE` si agent se déco |
| `assigned_at` | `whatsapp_chat` | dispatcher uniquement | Horodatage du dernier vrai dispatch |
| `assigned_mode` | `whatsapp_chat` | dispatcher | `ONLINE/OFFLINE` — ne reflète pas l'état temps réel |
| `unread_count` | `whatsapp_chat` | webhook entrant (+1), markRead (reset à 0) | Source de vérité du SLA — doit être exact |
| `last_client_message_at` | `whatsapp_chat` + `chat_session` | webhook entrant | Seuil SLA, incorrectement vide = re-dispatch |
| `first_response_deadline_at` | `whatsapp_chat` | dispatcher (+5 min), sla-checker (+30 min) | Contrôle l'urgence de ré-assignation |
| `read_only` | `whatsapp_chat` | auto-close, auto-message | Bloque dispatch si true |
| `active_session_id` | `whatsapp_chat` | ChatSessionService | Lié au cron enforcement |

---

## 7. Conditions qui empêchent le re-dispatch

Un canal ou une conversation est **protégée** contre le re-dispatch si :

| Condition | Protection |
|-----------|-----------|
| `WhapiChannel.poste_id IS NOT NULL` | Canal dédié → route toujours vers ce poste, skip queue |
| `conversation.read_only = true` | Webhook ignoré (pas de dispatch), sauf réouverture FERME |
| `conversation.status = FERME` | Exclue des re-dispatches SLA et orphan (sauf offline-reinjection) |
| Poste avec `is_queue_enabled = false` | Jamais dans la queue, jamais sélectionné |
| `shouldSkipAutoClose(channelId) = true` | Exclus du cron read-only-enforcement |

---

## 8. Recommandations

### Court terme (correctifs ciblés)

**R1 — Protéger contre le re-dispatch si réponse récente**  
Le sla-checker doit vérifier `last_poste_message_at` avant de re-dispatcher :
```sql
AND (last_poste_message_at IS NULL OR last_poste_message_at < last_client_message_at)
```
→ Si le commercial a répondu après le dernier message client, ne pas re-dispatcher.

**R2 — Vérification atomique dans `dispatchOrphanConversation()`**  
Lire et écrire `poste_id` dans une seule transaction avec `SELECT ... FOR UPDATE` pour éviter que l'orphan-checker et le webhook écrivent en même temps.

**R3 — Délai de grâce post-reconnexion**  
Ajouter un délai de 5–10 secondes entre la reconnexion d'un agent et son entrée dans la queue, pour laisser le temps aux webhooks en cours de s'appliquer sur son poste.

### Moyen terme

**R4 — Log de dispatch enrichi**  
Logger systématiquement `{ from_poste, to_poste, reason, triggered_by }` à chaque changement de `poste_id` pour tracer l'historique.

**R5 — Audit trail dispatch**  
Ajouter une table `dispatch_event` légère pour chaque réassignation : qui a déclenché (webhook/cron/admin), ancien poste, nouveau poste, timestamp.

---

*Rapport généré à partir de l'analyse statique du code source — branche `production`*
