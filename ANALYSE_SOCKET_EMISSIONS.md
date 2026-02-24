# Analyse des Emissions Socket Frontend - Risques de Doublons

**Date:** 2026-02-18
**Branche:** inification
**Scope:** `front/src/` - Toutes les emissions socket.emit et leur cycle de vie

---

## 1. Architecture Socket du Frontend

### Flux de connexion
```
SocketProvider.tsx  →  crée le socket (io())
       ↓
WebSocketEvents.tsx →  enregistre les listeners (socket.on) + émet les events initiaux
       ↓
chatStore.ts        →  stocke la ref socket + expose les actions (sendMessage, etc.)
contactStore.ts     →  stocke la ref socket (non utilisée directement pour émettre)
```

### Point d'entrée unique
Le socket est créé **une seule fois** dans `SocketProvider.tsx:30-46` avec `[user]` comme seule dépendance. Le cleanup est correct (disconnect + setSocket(null)).

---

## 2. Inventaire Complet des Emissions Socket

| # | Event émis | Fichier | Ligne | Déclencheur |
|---|-----------|---------|-------|-------------|
| 1 | `conversations:get` | chatStore.ts | 97 | `loadConversations()` |
| 2 | `messages:get` | chatStore.ts | 122 | `selectConversation()` |
| 3 | `messages:read` | chatStore.ts | 123 | `selectConversation()` |
| 4 | `message:send` | chatStore.ts | 165 | `sendMessage()` |
| 5 | `chat:event` (TYPING_START) | chatStore.ts | 175 | `onTypingStart()` |
| 6 | `chat:event` (TYPING_STOP) | chatStore.ts | 183 | `onTypingStop()` |
| 7 | `chat:event` (CONV_STATUS_CHANGE) | chatStore.ts | 190 | `changeConversationStatus()` |
| 8 | `contacts:get` | WebSocketEvents.tsx | 46 | `refreshAfterConnect()` |
| 9 | `messages:get` | WebSocketEvents.tsx | 50 | `refreshAfterConnect()` (si conv selectionnée) |

**Total: 9 points d'emission, 7 events distincts.**

---

## 3. PROBLEMES CRITIQUES IDENTIFIES

### 3.1 BUG CRITIQUE: useEffect avec 15 dépendances (WebSocketEvents.tsx:266-282)

```typescript
useEffect(() => {
  // ... setup listeners + refreshAfterConnect() ...
}, [
  socket,                       // SocketProvider
  user,                         // AuthProvider
  setSocket,                    // Zustand action
  setConversations,             // Zustand action
  setMessages,                  // Zustand action
  addMessage,                   // Zustand action
  updateConversation,           // Zustand action
  removeConversationBychat_id,  // Zustand action
  addConversation,              // Zustand action
  setTyping,                    // Zustand action
  clearTyping,                  // Zustand action
  loadConversations,            // Zustand action
  setContacts,                  // Zustand action (contactStore)
  upsertContact,                // Zustand action (contactStore)
  removeContact,                // Zustand action (contactStore)
]);
```

**Pourquoi c'est critique:**
- Zustand avec `create` retourne des **fonctions stables** (même référence entre renders). Donc en théorie, les actions Zustand ne changent pas de référence.
- **MAIS** les fonctions sont extraites via `useChatStore()` et `useContactStore()` dans le composant. Si le composant re-render (ex: changement de `user` ou `socket`), les destructurations sont ré-évaluées.
- En pratique avec Zustand vanilla (pas de sélecteur), **le composant re-render à CHAQUE changement de state** du store. Chaque appel `useChatStore()` sans sélecteur souscrit à **tout** le state.
- **Conclusion:** Le useEffect ne devrait PAS se re-déclencher à cause des actions Zustand (refs stables), mais le composant re-render inutilement souvent. Le vrai risque est si une action est redéfinie (ex: via middleware). **Risque: MOYEN** - les refs sont stables en Zustand standard.

### 3.2 BUG CRITIQUE: Double appel de refreshAfterConnect() (WebSocketEvents.tsx:248-256)

```typescript
socket.on('connect', refreshAfterConnect);    // Listener sur connect
socket.on('reconnect', refreshAfterConnect);  // Listener sur reconnect

if (socket.connected) {
  refreshAfterConnect();                      // Appel immédiat si déjà connecté
}
```

**Scénario de doublon:**
1. Le useEffect s'exécute
2. `socket.connected` est `true` → `refreshAfterConnect()` appelé (ligne 255)
3. socket.io émet aussi l'event `connect` en interne → le listener ligne 251 appelle à nouveau `refreshAfterConnect()`
4. **Résultat: `conversations:get`, `contacts:get` et `messages:get` émis 2 FOIS**

**Mais en réalité:** Socket.IO n'émet PAS `connect` si le socket est déjà connecté au moment de l'enregistrement du listener. Le `connect` event est émis une seule fois au moment de la connexion. Donc si `socket.connected === true`, le listener `connect` a déjà été émis et ne sera pas ré-émis.

**Scénario de doublon REEL sur reconnexion:**
1. Socket se déconnecte
2. Socket se reconnecte automatiquement
3. Socket.IO émet `connect` → `refreshAfterConnect()` ✓
4. Socket.IO émet `reconnect` → `refreshAfterConnect()` ✓ ← **DOUBLON!**

**Risque: ELEVE** - Sur chaque reconnexion, `refreshAfterConnect` est appelé 2 fois (events `connect` + `reconnect`).

### 3.3 BUG: Pas de debounce sur sendMessage (chatStore.ts:138-169)

```typescript
sendMessage: (text: string) => {
  const { socket, selectedConversation } = get();
  if (!socket || !selectedConversation) return;
  // ... crée tempMessage, l'ajoute au state ...
  socket.emit("message:send", { ... });
}
```

**Scénario de doublon:**
- L'utilisateur double-clique sur le bouton Envoyer
- `handleSubmit` dans ChatInput.tsx (ligne 113) est appelé 2 fois
- Le bouton a `disabled={!message.trim() ...}` mais le state `message` n'est vidé qu'après `onSendMessage` (ligne 117: `setMessage('')`)
- **Entre les 2 clics, `message.trim()` est encore non-vide** → 2 appels à `sendMessage` → 2 emissions `message:send`

**Risque: MOYEN** - Dépend de la vitesse du double-clic vs le re-render React.

### 3.4 BUG: handleTyping appelé uniquement sur onFocus (ChatInput.tsx:290-296)

```typescript
<textarea
  onChange={(e) => {
    setMessage(e.target.value);    // NE déclenche PAS handleTyping !
  }}
  onFocus={handleTyping}           // Seul déclencheur de typing
  onKeyDown={handleKeyDown}
/>
```

**Problème:** `handleTyping` n'est appelé que sur `onFocus`, pas sur chaque frappe. Le timeout de 2s (`TYPING_STOP_DELAY`) démarre au focus et expire, envoyant `TYPING_STOP`. Si l'utilisateur continue de taper après 2s, **aucun nouveau `TYPING_START` n'est émis** car `onChange` ne déclenche pas `handleTyping`.

**Ce n'est PAS un problème de doublon**, mais un **bug fonctionnel**: l'indicateur de frappe disparaît après 2s même si l'utilisateur tape encore.

---

## 4. PROBLEMES SECONDAIRES

### 4.1 selectConversation: Double émission intentionnelle (chatStore.ts:122-123)

```typescript
socket?.emit("messages:get", { chat_id });   // Charge les messages
socket?.emit("messages:read", { chat_id });  // Marque comme lu
```

**Pas un bug** - Ce sont 2 events différents avec des objectifs différents. Mais si l'utilisateur clique rapidement sur 2 conversations différentes, les réponses peuvent arriver dans le désordre.

### 4.2 loadConversations() appelé depuis 2 endroits

- `chatStore.ts:90` - action du store
- `WebSocketEvents.tsx:44` - via `refreshAfterConnect()`

Les 2 appellent `socket.emit("conversations:get")`. Pas de doublon direct car ils sont appelés dans des contextes différents, mais sur reconnexion (cf. 3.2), `loadConversations()` est appelé 2 fois.

### 4.3 contacts:get émis depuis 2 sources différentes

- `contactStore.ts:56` - `loadContacts()` (action du store, non appelée actuellement)
- `WebSocketEvents.tsx:46` - `refreshAfterConnect()`

`loadContacts()` du contactStore n'est **jamais appelé** dans le code frontend actuel. Seul `refreshAfterConnect` émet `contacts:get`. **Pas de doublon.**

### 4.4 Code de debug dans sendMessage (chatStore.ts:167)

```typescript
text: `${text}-${Math.random() * 1000}`,
```

**ATTENTION:** Ce code de debug modifie le texte envoyé en production! Il ajoute un nombre aléatoire à chaque message. Ce n'est clairement pas intentionnel pour la production.

### 4.5 Console.log de debug dans chatStore.ts (lignes 139, 143, 164)

```typescript
console.log("4444444444444444444444444444444444444444444444444444444");
console.log("555555555555555555555555555555555555555555555555555555");
console.log("666666666666666666666666666666666666666666666666666666", tempMessage);
```

Et dans ChatInput.tsx (ligne 115):
```typescript
logger.debug("333333333333333333333333333333333333333333333333333333333")
```

**À nettoyer avant production.**

---

## 5. ANALYSE DU FLUX message:send (le plus sensible)

### Chemin complet d'un message envoyé:

```
1. User clique "Envoyer" ou appuie Entrée
   └→ ChatInput.handleSubmit() [ChatInput.tsx:113]
      └→ onSendMessage(message.trim()) = chatStore.sendMessage
         └→ chatStore.sendMessage(text) [chatStore.ts:138]
            ├→ Crée tempMessage avec crypto.randomUUID()
            ├→ Ajoute tempMessage au state (status: "sending")
            └→ socket.emit("message:send", { chat_id, text, tempId })
```

### Protection contre les doublons côté front:

1. **tempId unique**: `crypto.randomUUID()` → chaque message a un ID unique
2. **Remplacement optimiste**: Quand le backend renvoie le message confirmé via `MESSAGE_ADD` avec le `tempId`, le front remplace le message temporaire (WebSocketEvents.tsx:78-88)
3. **dedupeMessagesById**: Utilise un `Map<id, Message>` pour dédupliquer (chatStore.ts:75-83)
4. **messageIdCache**: Set d'IDs déjà vus pour court-circuiter `addMessage` (chatStore.ts:226-228)

### Failles dans la protection:

**FAILLE 1**: Le `tempId` envoyé au backend (chatStore.ts:168) et l'`id` du tempMessage (chatStore.ts:147) sont **deux UUIDs différents!**

```typescript
const tempId = crypto.randomUUID();        // Ligne 145 - déclaré mais NON UTILISÉ dans l'emit!
const tempMessage: Message = {
  id: crypto.randomUUID(),                 // Ligne 147 - AUTRE UUID
  // ...
};
// ...
socket.emit("message:send", {
  tempId: tempMessage.id,                  // Ligne 168 - utilise tempMessage.id, pas tempId
});
```

La variable `tempId` (ligne 145) est **déclarée mais jamais utilisée**. C'est du code mort. Le vrai tempId envoyé au backend est `tempMessage.id`.

**FAILLE 2**: Aucun mécanisme de **lock/guard** n'empêche 2 appels rapides à `sendMessage`. Si l'utilisateur double-clique:
- Appel 1: crée tempMessage A, émet `message:send` avec tempId=A
- Appel 2: crée tempMessage B, émet `message:send` avec tempId=B
- Les 2 arrivent au backend → 2 messages identiques (même texte) sont créés
- Le backend les traite comme 2 messages différents car les tempId sont différents

---

## 6. RESUME DES RISQUES DE DOUBLON

| # | Risque | Sévérité | Impact | Event(s) affecté(s) |
|---|--------|----------|--------|---------------------|
| 1 | `connect` + `reconnect` doublent refreshAfterConnect | **ELEVE** | Données chargées 2x sur reconnexion | conversations:get, contacts:get, messages:get |
| 2 | Double-clic envoi message | **MOYEN** | 2 messages identiques envoyés | message:send |
| 3 | useEffect 15 deps potentiel re-run | **FAIBLE** | Listeners ré-enregistrés + refresh | tous les events de refresh |
| 4 | selectConversation sans debounce | **FAIBLE** | Messages chargés 2x | messages:get, messages:read |

---

## 7. CORRECTIONS RECOMMANDEES

### Fix 1: Supprimer le listener `reconnect` (le `connect` suffit)

```typescript
// WebSocketEvents.tsx - AVANT:
socket.on('connect', refreshAfterConnect);
socket.on('reconnect', refreshAfterConnect);

// APRES:
socket.on('connect', refreshAfterConnect);
// Le 'connect' est émis AUSSI sur reconnexion avec Socket.IO v4+
```

### Fix 2: Ajouter un guard anti-double-envoi dans sendMessage

```typescript
// chatStore.ts
sendMessage: (text: string) => {
  const { socket, selectedConversation } = get();
  if (!socket || !selectedConversation) return;

  // Guard: empêcher les envois rapides du même texte
  const lastSentKey = `${selectedConversation.chat_id}:${text}`;
  if ((window as any).__lastSentKey === lastSentKey &&
      Date.now() - ((window as any).__lastSentTime || 0) < 1000) {
    return; // Ignore doublon
  }
  (window as any).__lastSentKey = lastSentKey;
  (window as any).__lastSentTime = Date.now();

  // ... reste du code
}
```

Ou mieux: désactiver le bouton pendant l'envoi.

### Fix 3: Réduire les dépendances du useEffect

```typescript
// WebSocketEvents.tsx
// Les actions Zustand sont stables, pas besoin de les mettre en deps
useEffect(() => {
  if (!socket || !user) return;
  // ...
}, [socket, user]); // Seulement socket et user comme deps
```

### Fix 4: Ajouter handleTyping sur onChange

```typescript
<textarea
  onChange={(e) => {
    setMessage(e.target.value);
    handleTyping();  // ← Ajout
  }}
  onFocus={handleTyping}
/>
```

### Fix 5: Nettoyer le code de debug

- Supprimer `Math.random()` de `sendMessage` (chatStore.ts:167)
- Supprimer les `console.log("444...")` (chatStore.ts:139, 143, 164)
- Supprimer le `logger.debug("333...")` (ChatInput.tsx:115)
- Supprimer la variable `tempId` inutilisée (chatStore.ts:145)

---

## 8. CONCLUSION

Le **risque principal de doublon d'émission** est le **listener `reconnect`** dans WebSocketEvents.tsx qui provoque un double appel de `refreshAfterConnect()` à chaque reconnexion du socket. Cela envoie `conversations:get`, `contacts:get` et `messages:get` **deux fois** au backend.

Le deuxième risque est l'absence de guard anti-double-clic sur `sendMessage`, qui peut envoyer le même message deux fois si l'utilisateur clique très rapidement.

Les protections côté front (deduplication par ID, messageIdCache) protègent contre les **doublons en réception** mais pas contre les **doublons en émission**.
