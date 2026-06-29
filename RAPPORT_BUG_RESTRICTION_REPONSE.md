# Rapport de bug — Restriction de réponse

**Date** : 2026-06-29  
**Branche** : production  
**Sévérité globale** : Critique (fonctionnalité de restriction inopérante)

---

## Contexte

La fonctionnalité "Restriction de réponse" est censée bloquer l'accès à de nouvelles conversations non lues si la commerciale n'a pas répondu aux précédentes (réponse valide = minimum N caractères). En pratique, la restriction se déclenche silencieusement : aucune modale n'apparaît, aucun clic ne fonctionne, et le problème disparaît après plusieurs actualisations de page.

---

## Architecture de la fonctionnalité

### Backend
- **Service central** : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts`
- **Gateway WebSocket** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` (handlers l.840+)
- **Table BDD** : `commercial_conversation_access` (enregistre les accès/réponses du jour)

### Frontend
- **État global** : `front/src/store/chatStore.ts` (Zustand)
- **Modale UI** : `front/src/components/ConversationRestrictionModal.tsx`
- **Listeners WebSocket** : `front/src/components/WebSocketEvents.tsx`

### Flux normal (cas sans bug)
```
Commerciale clique sur conversation
  → frontend émet  : conversation:accessed { chat_id }
  → backend preCheck : checkRestriction(commercialId, posteId)
    → si bloquée  : émet restriction:status { triggered: true, unrespondedConversations: [...] }
    → sinon       : recordAccess() + re-check + émet restriction:status
  → frontend reçoit restriction:status
    → décide d'afficher ou non la modale
    → si restriction levée : reprend la sélection en attente
```

---

## Bugs identifiés

---

### BUG #1 — Modale invisible quand la seule conversation bloquante est celle actuellement ouverte

**Sévérité** : Critique  
**Fichier** : `front/src/store/chatStore.ts:247-249`

**Code problématique** :
```typescript
const shouldTrigger =
  status.triggered &&
  status.unrespondedConversations.some((c) => c.chat_id !== currentChatId);
```

**Cause** : La modale ne s'affiche que s'il existe au moins une conversation non-répondue *différente* de celle actuellement affichée. Si la seule conversation bloquante est précisément celle que la commerciale vient d'ouvrir, la condition `some(c => c.chat_id !== currentChatId)` retourne `false`, donc `shouldTrigger = false` → **la modale ne s'affiche jamais**.

**Scénario reproductible** :
1. Conversation B a un message client non-répondu (le client a écrit *après* la dernière réponse de la commerciale)
2. La commerciale clique sur B
3. Backend : `preCheck` trouve B bloquante → envoie `{ triggered: true, unrespondedConversations: [{ chat_id: B }] }`
4. Frontend reçoit → `shouldTrigger = true && [B].some(c => c.chat_id !== B)` → **false**
5. Modale silencieuse, rien ne se passe
6. La commerciale clique sur d'autres conversations → même blocage silencieux

**Conséquence directe** : C'est le bug principal qui explique tout le comportement décrit. La commerciale est bloquée mais ne le sait pas.

---

### BUG #2 — Requête N+1 dans le check `requireLastMessageMine`

**Sévérité** : Majeure (performance)  
**Fichier** : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts:206-224`

**Code problématique** :
```typescript
if (config.requireLastMessageMine) {
  const filtered: CommercialConversationAccess[] = [];
  for (const access of effectiveAccesses) {
    const lastMsg = await this.messageRepository
      .createQueryBuilder('msg')
      .where('msg.chat_id = :chatId', { chatId: access.chatId })
      .andWhere('msg.deletedAt IS NULL')
      .orderBy('msg.timestamp', 'DESC')
      .limit(1)
      .getOne(); // ← UNE REQUÊTE PAR CONVERSATION NON-RÉPONDUE
    if (!lastMsg || !lastMsg.from_me) {
      filtered.push(access);
    }
  }
  effectiveUnresponded = filtered;
}
```

**Cause** : Pour N conversations non-répondues, cette boucle génère N requêtes SQL séquentielles au lieu d'une seule. Ce délai aggrave les race conditions du BUG #5 et peut rendre le check perceptiblement lent.

---

### BUG #3 — La sélection en attente (`pendingConversationId`) n'est pas reprise après levée de restriction

**Sévérité** : Majeure  
**Fichier** : `front/src/store/chatStore.ts:257-264` + `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:1176-1192`

**Code problématique** :
```typescript
if (!status.triggered) {
  const pending = get().pendingConversationId;
  if (pending) {
    set({ pendingConversationId: null });
    get()._doSelectConversation(pending);
  }
}
```

**Cause** : `pendingConversationId` est vidé dès que la restriction se déclenche. Lorsque la restriction se lève (après une réponse valide), le store reçoit `restriction:status { triggered: false }`, mais `pendingConversationId` est déjà `null` → la commerciale reste bloquée visuellement, rien ne reprend.

**Scénario** :
1. Commerciale clique sur B → blocage, modale (si BUG #1 corrigé)
2. Elle répond à la conversation requise → restriction levée
3. Backend émet `restriction:status { triggered: false }`
4. Frontend reçoit → `pending = null` → **aucune reprise automatique**

---

### BUG #4 — `preCheck` rejette l'accès sans tenir compte de la conversation cliquée

**Sévérité** : Majeure  
**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:859-866`

**Code problématique** :
```typescript
const preCheck = await this.restrictionService.checkRestriction(
  agent.commercialId,
  agent.posteId
);
if (preCheck.triggered) {
  client.emit('restriction:status', preCheck);
  return; // ← RETOUR SANS ENREGISTRER L'ACCÈS AU chat_id CLIQUÉ
}
await this.restrictionService.recordAccess(agent.commercialId, payload.chat_id);
```

**Cause** : Le `preCheck` ne connaît pas le `chat_id` que la commerciale veut ouvrir. Il rejette immédiatement sans enregistrer l'accès. Cela signifie que si la commerciale clique sur la conversation bloquante elle-même (pour répondre), le backend la bloque aussi — cercle vicieux.

---

### BUG #5 — Race condition entre envoi de message et vérification de restriction

**Sévérité** : Modérée  
**Fichier** : `front/src/store/chatStore.ts:241-265` vs `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:1187-1191`

**Cause** : Après un envoi de message valide :
- T1 : Backend appelle `recordResponse()` + `checkRestriction()` → émet `restriction:status` (levée)
- T2 : Avant réception, la commerciale clique sur une autre conversation → émet `conversation:accessed`
- T3 : Backend reçoit `conversation:accessed` → fait `preCheck` basé sur l'**ancien état** (avant levée)
- Résultat : comportement imprévisible selon chronologie, peut déclencher une restriction fantôme

**C'est ce bug qui explique pourquoi "plusieurs actualisations finissent par guérir le problème"** : le refresh force une ré-synchronisation complète état frontend ↔ backend.

---

## Récapitulatif

| # | Bug | Fichier(s) | Impact |
|---|-----|-----------|--------|
| 1 | Modale non affichée si seule conv bloquante = conv ouverte | `chatStore.ts:247` | **Critique** — bug principal |
| 2 | Requête N+1 dans `requireLastMessageMine` | `conversation-restriction.service.ts:206` | Majeur — perf |
| 3 | `pendingConversationId` non repris après levée | `chatStore.ts:257` | Majeur — UX |
| 4 | `preCheck` sans connaissance du `chat_id` cliqué | `gateway.ts:859` | Majeur — logique |
| 5 | Race condition envoi ↔ vérification restriction | `gateway.ts:1187` + `chatStore.ts:241` | Modéré — instabilité |

---

## Corrections recommandées

### Fix BUG #1 — Simplifier la condition `shouldTrigger`

**`front/src/store/chatStore.ts:247`**

```typescript
// Avant (incorrect)
const shouldTrigger =
  status.triggered &&
  status.unrespondedConversations.some((c) => c.chat_id !== currentChatId);

// Après (correct)
const shouldTrigger = status.triggered;
```

### Fix BUG #2 — Remplacer la boucle N+1 par une requête unique

**`conversation-restriction.service.ts:206`** — remplacer la boucle `for` par :
```typescript
if (config.requireLastMessageMine) {
  const chatIds = effectiveAccesses.map((a) => a.chatId);
  const lastMessages = await this.messageRepository
    .createQueryBuilder('msg')
    .select(['msg.chat_id', 'msg.from_me'])
    .where('msg.chat_id IN (:...chatIds)', { chatIds })
    .andWhere('msg.deletedAt IS NULL')
    .andWhere(`msg.id IN (
      SELECT MAX(m2.id) FROM whatsapp_message m2
      WHERE m2.chat_id IN (:...chatIds) AND m2.deleted_at IS NULL
      GROUP BY m2.chat_id
    )`)
    .getMany();

  const lastMsgMap = new Map(lastMessages.map((m) => [m.chatId, m]));
  effectiveUnresponded = effectiveAccesses.filter((access) => {
    const last = lastMsgMap.get(access.chatId);
    return !last || !last.fromMe;
  });
}
```

### Fix BUG #3 — Garder `pendingConversationId` jusqu'à levée effective

**`chatStore.ts`** — ne pas vider `pendingConversationId` lors du déclenchement, seulement à la levée :
```typescript
// Dans le handler restriction:status
if (status.triggered) {
  set({ restrictionTriggered: true, restrictionStatus: status });
  // Ne pas vider pendingConversationId ici
} else {
  const pending = get().pendingConversationId;
  set({ restrictionTriggered: false, restrictionStatus: status, pendingConversationId: null });
  if (pending) {
    get()._doSelectConversation(pending);
  }
}
```

### Fix BUG #4 — Passer `chat_id` au `preCheck`

**`gateway.ts:859`** — passer le `chat_id` cliqué au service de restriction pour qu'il sache si cet accès résoudrait la restriction :
```typescript
const preCheck = await this.restrictionService.checkRestriction(
  agent.commercialId,
  agent.posteId,
  payload.chat_id // nouveau paramètre : exclure ce chat du calcul si c'est une conv bloquante
);
```

### Fix BUG #5 — Ajouter un timestamp de version sur `restriction:status`

Envoyer un `version` (timestamp) avec chaque `restriction:status` côté backend, et ignorer côté frontend les réponses dont le `version` est inférieur au dernier reçu.

---

## Ordre de priorité des corrections

1. **BUG #1** — Fix immédiat, une ligne, impact critique
2. **BUG #3** — Fix urgent, comportement UX cassé post-restriction
3. **BUG #4** — Fix important, logique de preCheck incorrect
4. **BUG #2** — Fix performance, évite dégradation sur volume
5. **BUG #5** — Fix stabilité, évite états fantômes
