# Rapport Bug — Fenêtre 24h & Logique "En Attente"
Date : 2026-06-17

---

## 1. Bug champ de saisie bloqué (fenêtre 24h expirée)

### 1.1 Condition de blocage côté frontend

La condition se trouve dans **`front/src/components/chat/ChatMainArea.tsx:38–41`** :

```typescript
const windowExpired =
  selectedConversation != null &&
  !selectedConversation.channel_dedicated &&
  (!windowExpiresAt || new Date(windowExpiresAt).getTime() <= Date.now());
```

**Le bug est ici.** La condition `!windowExpiresAt` interprète `window_expires_at = null` comme une fenêtre expirée. Or `null` signifie aussi "pas de session encore ouverte" — ce qui peut être le cas d'une conversation récente ou d'une conversation créée avant la migration vers le système de sessions.

Le composant `ChatInput` reçoit `windowExpired={true}` et affiche :

```tsx
if (windowExpired) {
  return (
    <div className="bg-orange-50 ...">
      <p>Le client n'a pas écrit depuis plus de 23h. En attente d'un message de sa part pour reprendre la conversation.</p>
    </div>
  );
}
```

### 1.2 Source de la donnée (backend → frontend)

Chaîne exacte :

1. **Entité** : `WhatsappChat.windowExpiresAt` — colonne `window_expires_at` — `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`
2. **Mapping gateway** : `whatsapp_message.gateway.ts` → `window_expires_at: chat.windowExpiresAt ? new Date(chat.windowExpiresAt).toISOString() : null`
3. **Transformation frontend** : `front/src/types/chat.ts` → `window_expires_at: raw.window_expires_at ? new Date(raw.window_expires_at) : null`
4. **Lecture dans le composant** : `front/src/components/chat/ChatMainArea.tsx:37` → `const windowExpiresAt = selectedConversation?.window_expires_at`

### 1.3 Calcul côté backend

`window_expires_at` est géré par `ChatSessionService` (`message_whatsapp/src/chat-session/chat-session.service.ts`) :

- **Ouverture session** (`.openSession()`) : à chaque nouveau message client entrant sans session active, `windowExpiresAt = now + 24h` (ou 72h si CTWA). La valeur est écrite dans `whatsapp_chat.window_expires_at`.
- **Message client sur session existante** (`.onClientMessage()`) : recalcul à chaque message entrant — `windowExpiresAt` est remis à `now + 24h`, prolongeant la fenêtre.
- **Fermeture session** (`.closeSession()`, `.closeSessionByChatId()`, `.closeExpiredChatByWindowExpiry()`) : `windowExpiresAt` est mis à `null`.

Le flux est déclenché par `inbound-message.service.ts` : chaque webhook entrant appelle `chatSessionService.onClientMessage()` ou `chatSessionService.openSession()`.

### 1.4 Diagnostic probable du bug

Trois scénarios coexistent :

**Scénario A — Conversation créée avant la migration vers le système de sessions :**
Une conversation `actif` créée antérieurement à la migration `Phase9SlidingWindow...` n'a jamais eu de session ouverte. Son `window_expires_at` est `NULL` en base. Le frontend interprète `null` comme "fenêtre expirée" → blocage immédiat même si le client a écrit récemment.

**Scénario B — Race condition fermeture / réouverture :**
1. Le cron de fermeture détecte `windowExpiresAt < now` et appelle `closeExpiredChatByWindowExpiry()` qui met `windowExpiresAt = null` et `status = FERME`.
2. Un message client arrive juste après, `dispatcherService.assignConversation()` remet le statut à `ACTIF`, mais sans ouvrir de nouvelle session si le bloc `chatSession` échoue silencieusement.
3. Résultat : conversation `actif`, `windowExpiresAt = null` → champ bloqué.

**Scénario C — Erreur silencieuse dans la synchronisation de session :**
Dans `inbound-message.service.ts`, toute la synchronisation de session est dans un bloc `try/catch` global qui logue l'erreur mais n'interrompt pas le flux. Si `openSession()` ou `onClientMessage()` échoue (deadlock BDD, contrainte FK, timeout), `windowExpiresAt` n'est pas mis à jour — la conversation reste `actif` avec `windowExpiresAt = null`.

---

## 2. Logique transitions "en attente"

### 2.1 Passage actif → en_attente

Trois chemins déclenchent le passage `ACTIF → EN_ATTENTE` :

1. **Webhook entrant — aucun poste disponible** (`dispatcher.service.ts`) : si `resolvePosteForChannel()` retourne `null`, le statut est mis à `EN_ATTENTE`.

2. **Déconnexion commerciale** (`whatsapp_message.gateway.ts`) : `handleDisconnect()` appelle `posteService.setActive(agent.posteId, false)`. Ensuite, le cron `resetStuckActiveToWaiting` détecte les conversations `ACTIF` dont le poste est inactif et les bascule `EN_ATTENTE`.

3. **SLA checker** (`jobRunnerAllPostes`) : redistribue une conversation vers un poste inactif → statut `EN_ATTENTE`.

### 2.2 Passage en_attente → actif (reconnexion poste)

Quand un commercial se reconnecte, `handleConnection()` dans `whatsapp_message.gateway.ts` :
1. Appelle `commercialService.updateStatus(commercialId, true)`
2. Appelle `posteService.setActive(posteId, true)`
3. Appelle `queueService.addPosteToQueue(posteId)`
4. Appelle `jobRunner.startAgentSlaMonitor(posteId)` → `dispatcher.jobRunnertcheque(posteId)`

`jobRunnertcheque()` cherche les conversations `ACTIF`, `EN_ATTENTE` ou `FERME` avec `unread_count > 0` pour ce poste et appelle `reinjectConversation()`.

**Point critique** : `reinjectConversation()` déplace la conversation vers un autre poste disponible dans la queue. Il n'y a **pas de code explicite qui remette une conversation EN_ATTENTE en ACTIF sur le même poste** à la reconnexion.

### 2.3 Diagnostic : est-ce que les conversations en attente sont bien réactivées ?

**Non, le passage automatique `EN_ATTENTE → ACTIF` sur le même poste n'est pas implémenté.**

La reconnexion déclenche uniquement `jobRunnertcheque()` qui appelle `reinjectConversation()`. Cette méthode :
- **Ignore les conversations avec `unread_count = 0`** — une conversation sans nouveau message du client reste `EN_ATTENTE` indéfiniment
- Si `unread_count > 0`, réassigne vers un **autre** poste de la queue (pas forcément le même)

Le cron `offline-reinject` (quotidien à 9h) traite les conversations des postes hors ligne, mais les rebalance vers d'autres postes actifs — jamais vers le poste d'origine.

**Résultat concret** : un commercial se reconnecte → ses conversations `EN_ATTENTE` sans nouveau message client restent `EN_ATTENTE` et ne lui sont pas réaffectées automatiquement.

---

## 3. Bugs identifiés

### Bug #1 — CRITIQUE : `window_expires_at = null` interprété comme fenêtre expirée

**`front/src/components/chat/ChatMainArea.tsx:41`**
```typescript
(!windowExpiresAt || new Date(windowExpiresAt).getTime() <= Date.now())
// ^ null = "pas de session" est traité comme "fenêtre expirée"
```
`null` est une valeur légitime (session non encore initialisée, ou conversation pré-migration). Elle ne devrait pas déclencher le blocage du champ de saisie.

### Bug #2 — Erreur silencieuse dans la synchronisation de session

**`message_whatsapp/src/webhooks/inbound-message.service.ts`**
Le bloc `try/catch` avale les erreurs de `ChatSessionService.openSession()` et `onClientMessage()`. En cas d'erreur, `windowExpiresAt` n'est jamais mis à jour, laissant la conversation en état incohérent (actif mais champ bloqué).

### Bug #3 — Conversations pré-migration sans session

Les conversations `actif` créées avant la migration `Phase9SlidingWindow...` n'ont pas de session active et leur `window_expires_at` est `NULL`. Aucun mécanisme de backfill n'est en place.

### Bug #4 — `resetStuckActiveToWaiting` non automatique

**`message_whatsapp/src/dispatcher/dispatcher.controller.ts`**
La méthode `resetStuckActiveToWaiting()` qui bascule les conversations `ACTIF` avec poste inactif vers `EN_ATTENTE` n'est pas appelée par un cron — seulement via `POST /dispatch/reset-stuck`. Des conversations peuvent rester `ACTIF` avec un poste `is_active = false` indéfiniment.

### Bug #5 — Conversations EN_ATTENTE non réaffectées à la reconnexion

Quand un poste se reconnecte, ses conversations `EN_ATTENTE` avec `unread_count = 0` ne repassent pas en `ACTIF`. Seules les conversations avec de nouveaux messages non lus sont traitées.

### Bug #6 — Texte "23h" incohérent avec le TTL réel de 24h

**`front/src/components/chat/ChatInput.tsx`**
Le message affiché dit "Le client n'a pas écrit depuis plus de **23h**" mais `TTL_NORMAL_HOURS = 24` dans `message_whatsapp/src/chat-session/constants.ts`. Le texte est incorrect et désynchronisé de la valeur réelle.

---

## 4. Corrections recommandées

### Correction #1 — Bug principal (priorité HAUTE)

Dans `front/src/components/chat/ChatMainArea.tsx:38–41`, distinguer `null` de "fenêtre expirée" :

```typescript
// AVANT (bugué) :
const windowExpired =
  selectedConversation != null &&
  !selectedConversation.channel_dedicated &&
  (!windowExpiresAt || new Date(windowExpiresAt).getTime() <= Date.now());

// APRÈS (corrigé) :
const windowExpired =
  selectedConversation != null &&
  !selectedConversation.channel_dedicated &&
  windowExpiresAt != null &&
  new Date(windowExpiresAt).getTime() <= Date.now();
```

Cela résout le cas principal : une conversation `actif` avec `window_expires_at = null` ne bloquera plus le champ de saisie.

### Correction #2 — Backfill des conversations sans session (priorité HAUTE)

Pour chaque `WhatsappChat` avec `status IN ('actif', 'en_attente')` et `window_expires_at IS NULL` et `last_client_message_at > NOW() - INTERVAL 24 HOUR`, mettre à jour directement :

```sql
UPDATE whatsapp_chat
SET window_expires_at = DATE_ADD(last_client_message_at, INTERVAL 24 HOUR)
WHERE status IN ('actif', 'en_attente')
  AND window_expires_at IS NULL
  AND last_client_message_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
  AND last_client_message_at IS NOT NULL;
```

### Correction #3 — Réaffectation des conversations EN_ATTENTE à la reconnexion (priorité HAUTE)

Dans `whatsapp_message.gateway.ts`, lors de `handleConnection()`, après `posteService.setActive(posteId, true)`, ajouter un appel qui remet `ACTIF` toutes les conversations `EN_ATTENTE` de ce poste :

```typescript
// Remettre en actif les conversations EN_ATTENTE de ce poste
await this.dispatcherService.reactivateWaitingConversationsForPoste(posteId);
```

La méthode `reactivateWaitingConversationsForPoste()` doit faire :
```typescript
await this.chatRepo.update(
  { posteId, status: 'en_attente' },
  { status: 'actif' }
);
// émettre un event WS de mise à jour du statut
```

### Correction #4 — Automatiser `resetStuckActiveToWaiting` (priorité MOYENNE)

Enregistrer `resetStuckActiveToWaiting` comme cron (ex : toutes les 5 min) pour qu'il bascule automatiquement les conversations `ACTIF` avec poste hors ligne vers `EN_ATTENTE`.

### Correction #5 — Logger les erreurs de session sans les avaler (priorité MOYENNE)

Dans `inbound-message.service.ts`, ajouter une alerte système si `openSession()` échoue :

```typescript
} catch (err) {
  this.logger.error('ChatSession sync failed — windowExpiresAt not updated', err);
  // Considérer un mécanisme d'alerte si le taux d'échec est élevé
}
```

### Correction #6 — Corriger le texte "23h" (priorité BASSE)

Dans `front/src/components/chat/ChatInput.tsx`, corriger "23h" → "24h" pour refléter le TTL réel (`TTL_NORMAL_HOURS = 24`).

---

## 5. Résumé des priorités

| # | Bug | Priorité | Fichier |
|---|-----|----------|---------|
| 1 | `null` interprété comme fenêtre expirée | **CRITIQUE** | `front/src/components/chat/ChatMainArea.tsx:41` |
| 2 | Conversations EN_ATTENTE non réaffectées à la reconnexion | **HAUTE** | `whatsapp_message.gateway.ts` + `dispatcher.service.ts` |
| 3 | Conversations pré-migration sans session bloquées | **HAUTE** | SQL backfill |
| 4 | Erreur silencieuse synchronisation session | **MOYENNE** | `inbound-message.service.ts` |
| 5 | `resetStuckActiveToWaiting` non automatique | **MOYENNE** | `dispatcher.controller.ts` |
| 6 | Texte "23h" incorrect | **BASSE** | `front/src/components/chat/ChatInput.tsx` |
