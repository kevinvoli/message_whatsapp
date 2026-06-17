# Rapport — Bug blocage commercial : conversations non répondues > maxUnrespondedConvs
Date : 2026-06-17

---

## 1. Fonctionnement attendu du système

### Flux normal théorique

1. **Clic sur une conversation** (`front/src/store/chatStore.ts:395-429`)
   Le commercial clique sur une conversation avec `unreadCount > 0`. Le store émet `conversation:accessed` via WebSocket.

2. **Réception côté backend** (`message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:809-839`)
   `handleConversationAccessed` appelle d'abord `checkRestriction()` (pre-check). Si le commercial est déjà bloqué → renvoie l'état bloqué sans enregistrer l'accès. Sinon → appelle `recordAccess()` puis `checkRestriction()` à nouveau et renvoie le résultat.

3. **Enregistrement de l'accès** (`message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts:48-95`)
   `recordAccess()` crée une ligne dans `commercial_conversation_access` avec `responded_at = NULL` pour (commercialId, chatId, accessDate=aujourd'hui). Si la conversation est fermée, `read_only`, fenêtre expirée, ou sans canal → accès non tracé.

4. **Détection du blocage** (`conversation-restriction.service.ts:128-258`)
   `checkRestriction()` compte les accès du jour avec `responded_at IS NULL`, filtre les chats fermés/expirés/sans canal, vérifie en base si un message suffisamment long a été envoyé (bootstrap). Si `unrespondedCount > maxUnrespondedConvs` → `triggered = true`.

5. **Affichage du modal** (`front/src/components/ConversationRestrictionModal.tsx:20`)
   Le composant s'affiche si `restrictionTriggered === true` dans le store, à condition que la liste des conversations bloquantes contienne au moins une conversation *autre* que celle déjà ouverte (`chatStore.ts:241-243`).

6. **Levée du blocage** (`gateway.ts:1066-1083`)
   Quand le commercial envoie un message via `message:send` et qu'il est assez long (`>= minResponseChars`), `recordResponse()` met à jour `responded_at` puis `checkRestriction()` est réévalué.

---

## 2. Cycle de vie de CommercialConversationAccess

### Création
Unique point de création : `recordAccess()` — `conversation-restriction.service.ts:85-94`.
Déclencheur : événement WebSocket `conversation:accessed`, lui-même émis uniquement depuis `chatStore.ts:426` lors d'un **clic manuel** du commercial sur une conversation ayant `unreadCount > 0`.

### Mise à jour de `respondedAt`
Deux chemins :
- **Path A — `recordResponse()`** (`service.ts:100-123`) : appelé dans `gateway.ts:1072` après un envoi réussi via `message:send`. Met `responded_at = NOW()` si `textLength >= minResponseChars` et si une ligne existe pour (commercialId, chatId, today).
- **Path B — bootstrap** (`service.ts:188-195`) : lors de `checkRestriction()`, si un message `from_me` avec `CHAR_LENGTH >= minResponseChars` envoyé aujourd'hui est trouvé en base pour cette conversation, la ligne est marquée répondue en asynchrone (`void`).

### Cas non couverts — racine du bug
Voir section 4.

---

## 3. Analyse du modal frontend

### Condition de déclenchement
`ConversationRestrictionModal.tsx:20` : `if (!restrictionTriggered) return null;`

`restrictionTriggered` est positionné à `true` dans `chatStore.ts:246-248` uniquement si :
- `status.triggered === true` (backend dit bloqué)
- ET au moins une conversation non-répondue est différente de la conversation actuellement ouverte (`chatStore.ts:241-243`)

### Blocage purement frontend
Le modal est un overlay CSS (`fixed inset-0 z-50`) sans logique de blocage réseau. Le backend **n'a aucun garde** sur `message:send` qui vérifie la restriction. Le blocage est exclusivement frontend.

### Contournements possibles
1. **Rechargement de page** : `restrictionTriggered` revient à `false` (état initial, `chatStore.ts:204`). Le modal disparaît. L'état de restriction n'est rechargé que si `loadRestrictionConfig()` est appelé, mais cette fonction ne charge que la **config** (enabled, maxUnrespondedConvs…), pas l'état de restriction courant. Au rechargement, le commercial peut cliquer librement.

2. **Plusieurs onglets** : chaque onglet a son propre store Zustand en mémoire. Un onglet bloqué n'empêche pas l'envoi depuis un autre onglet.

3. **Navigation directe par URL** : si la page est rechargée ou si le commercial accède directement à une URL, le store repart de zéro sans restriction.

4. **Fermeture du modal via le bouton X** (`ConversationRestrictionModal.tsx:42-46`) : `closeRestrictionModal()` positionne `restrictionTriggered = false` et efface `pendingConversationId`. Le commercial peut ensuite cliquer sur n'importe quelle conversation — la restriction sera réévaluée seulement si `unreadCount > 0`.

---

## 4. Analyse des trous — statut bug / comportement voulu

> Légende : ✅ Comportement voulu | 🐛 Bug confirmé | ⚠️ Bug possible

---

### Trou n°1 — Bypass sur les conversations avec `unreadCount === 0` ✅ Comportement voulu

**Fichier** : `front/src/store/chatStore.ts:409-416`

```typescript
if (
  !state.restrictionConfig?.enabled ||
  conversation?.readonly ||
  (conversation != null && conversation.unreadCount <= 0)  // ← bypass intentionnel
) {
  get()._doSelectConversation(chat_id);
  return;
}
```

Le système ne trace que les ouvertures de conversations avec de nouveaux messages non lus. C'est un choix de conception voulu : seuls les accès à des conversations avec `unreadCount > 0` déclenchent la mécanique de restriction.

---

### Trou n°2 — Conversations assignées automatiquement non tracées ✅ Comportement voulu

**Fichier** : `conversation-restriction.service.ts:48`

`recordAccess()` n'est appelé qu'à l'ouverture manuelle d'une conversation par le commercial. Les conversations assignées automatiquement par le dispatcher sans clic du commercial ne créent pas d'entrée. C'est voulu : le commercial ne peut être tenu responsable que des conversations qu'il a activement ouvertes.

---

### Trou n°3 — Le preCheck bloque l'enregistrement des accès supplémentaires 🐛 Bug confirmé

**Fichier** : `gateway.ts:831-835`

```typescript
const preCheck = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
if (preCheck.triggered) {
  client.emit('restriction:status', preCheck);
  return;  // ← recordAccess() jamais appelé
}
```

Quand la restriction est déjà déclenchée, ouvrir une nouvelle conversation ne crée **pas** d'entrée d'accès. L'effet de bord : si les conversations non répondues se ferment automatiquement (cron) alors que le commercial est bloqué, la restriction peut se lever sans que les nouvelles ouvertures soient tracées. Le commercial peut ainsi accumuler des conversations non tracées entre deux évaluations de `checkRestriction()`, échappant au compteur.

---

### Trou n°4 — `recordResponse()` sans entrée préalable fait un early return ✅ Comportement voulu

**Fichier** : `conversation-restriction.service.ts:111-116`

```typescript
if (!existing) {
  return;  // ← rien à faire si pas d'accès tracé
}
```

Si la conversation n'a pas été tracée dans `commercial_conversation_access`, il n'y a rien à marquer comme répondu. C'est cohérent avec le modèle : on ne peut marquer répondu que ce qui a été tracé comme accédé.

---

### Trou n°5 — Le blocage est 100% frontend : aucun guard backend sur `message:send` 🐛 Bug confirmé

**Fichier** : `gateway.ts:889-1113` — handler `handleSendMessage`

Le handler `message:send` vérifie : conversation fermée, fenêtre expirée, canal introuvable, message trop court. Mais **aucune vérification de l'état de restriction du commercial**. Un commercial qui contourne le modal (rechargement de page, second onglet, navigation directe) peut envoyer des messages normalement sans que le backend refuse quoi que ce soit. C'est le contournement le plus simple et le plus courant.

---

### Trou n°6 — Le modal se ferme quand la conversation bloquante est la conversation active ✅ Comportement voulu

**Fichier** : `chatStore.ts:241-243`

```typescript
const shouldTrigger =
  status.triggered &&
  status.unrespondedConversations.some((c) => c.chat_id !== currentChatId);
```

La logique est intentionnelle : si la seule conversation non répondue est précisément celle que le commercial est en train de regarder, le modal ne doit pas bloquer — le commercial est en train de la traiter.

---

### Trou n°7 — Filtre `poste_id IS NULL` dans `checkRestriction()` ⚠️ Bug possible

**Fichier** : `conversation-restriction.service.ts:166`

```typescript
if (posteId && chat.poste_id !== null && chat.poste_id !== posteId) return false;
```

Cette condition exclut les chats d'un poste différent, mais **ne filtre pas** les chats dont `chat.poste_id === null` (conversation non encore assignée à un poste). Ces conversations sans poste peuvent être comptées dans le quota du commercial alors qu'elles ne lui appartiennent pas. À vérifier en production selon la fréquence des conversations sans poste dans les états `actif`/`en_attente`.

---

## 5. Scénarios concrets qui permettent d'accumuler > maxUnrespondedConvs

### Scénario A — Rechargement de page
1. Commercial a 3 conversations non répondues → modal affiché, restriction `triggered=true`.
2. Commercial recharge la page (F5 / fermeture onglet).
3. `restrictionTriggered` repart à `false`. Aucune restriction visible.
4. Commercial clique sur 5 nouvelles conversations → si elles ont `unreadCount > 0`, `recordAccess()` est appelé, mais le modal ne s'affiche que si `checkRestriction()` décide de bloquer. Comme il n'y a pas de vérification au chargement, le commercial peut naviguer librement jusqu'au prochain clic qui déclenche une réévaluation.

### Scénario B — Conversations déjà lues (unreadCount = 0)
1. Poste reçoit 10 conversations. Un autre commercial les a toutes marquées lues (unread_count = 0 en base).
2. Le commercial ouvre chacune d'elles → bypass `unreadCount <= 0` dans le store → `conversation:accessed` jamais émis → 0 entrée dans `commercial_conversation_access`.
3. Le commercial ne répond à aucune → compteur = 0 → jamais bloqué.

### Scénario C — Conversations assignées auto sans clic du commercial
1. Dispatcher assigne 20 conversations au commercial pendant la nuit.
2. Commercial se connecte le matin et ne clique sur aucune → 0 entrée dans `commercial_conversation_access`.
3. Il peut ouvrir et répondre sélectivement sans jamais atteindre `maxUnrespondedConvs`.

### Scénario D — Ouverture d'une nouvelle conversation via "Répondre" dans le modal
1. Commercial est bloqué (3 non répondues). Modal affiché.
2. Il clique "Répondre" sur conv A → `dismissRestriction('chatId_A')` → `restrictionTriggered = false` → navigate vers conv A.
3. Il écrit 2 caractères (< minResponseChars) → `recordResponse()` ne met pas `responded_at`.
4. Il clique sur conv B (unreadCount=0) → bypass → `_doSelectConversation()` direct → 0 vérification → 0 `recordAccess()` → 0 comptage.
5. Il répète pour les convs C, D, E → accumulation sans blocage.

### Scénario E — Second onglet / connexion simultanée
1. Commercial ouvre 2 onglets du front.
2. Onglet 1 : restriction triggered.
3. Onglet 2 : store propre → peut ouvrir et répondre sans restriction.

---

## 6. Recommandations — corrections des bugs confirmés

### Bug #3 — Guard backend manquant sur `message:send` (priorité HAUTE)

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` — début de `handleSendMessage` (~ligne 925)

Ajouter un appel à `checkRestriction()` avant l'envoi. C'est le seul correctif qui empêche tout contournement frontend (rechargement, second onglet, navigation directe).

```typescript
const restrictionStatus = await this.restrictionService.checkRestriction(agent.commercialId, agent.posteId);
if (restrictionStatus.triggered) {
  client.emit('restriction:status', restrictionStatus);
  client.emit('chat:event', {
    type: 'MESSAGE_SEND_ERROR',
    payload: {
      chat_id: payload.chat_id,
      tempId: payload.tempId,
      code: 'RESTRICTION_TRIGGERED',
      message: 'Répondez d\'abord aux conversations en attente.',
    },
  });
  return;
}
```

### Bug #3 — Rechargement de page efface l'état de restriction (priorité HAUTE)

**Fichier** : `front/src/store/chatStore.ts` — dans `setSocket` (~ligne 231)

Au moment de la reconnexion socket, émettre un événement `restriction:check` pour récupérer l'état courant de restriction et initialiser `restrictionTriggered` correctement, sans attendre le prochain clic du commercial.

### Bug #7 — Filtre `poste_id IS NULL` dans `checkRestriction()` (priorité MOYENNE)

**Fichier** : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts:166`

Remplacer :
```typescript
if (posteId && chat.poste_id !== null && chat.poste_id !== posteId) return false;
```
Par :
```typescript
if (posteId && chat.poste_id !== posteId) return false;
```
Cela exclut aussi les conversations sans poste (`poste_id IS NULL`) du quota du commercial.

---

## Duplications / réutilisables détectés

- `conversation-restriction.service.ts:207-223` — boucle N+1 sur `effectiveAccesses` pour récupérer le dernier message (quand `requireLastMessageMine === true`). Devrait être une seule requête SQL groupée avec `MAX(timestamp)` et `GROUP BY chat_id`, comme le bootstrap l'est déjà.
- `chatStore.ts:363-388` et `chatStore.ts:463-487` — `_doSelectConversation` et `dismissRestriction` ont une logique de reset identique (messages, unreadCount, cache). Extraire en méthode partagée interne.
