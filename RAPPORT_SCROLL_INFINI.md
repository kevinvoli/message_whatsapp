# Rapport d'analyse — Scroll Infini

_Date : 2026-04-09_

---

## 1. Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `front/src/components/sidebar/ConversationList.tsx` | Sentinel scroll conversations |
| `front/src/components/chat/ChatMessages.tsx` | Sentinel scroll messages |
| `front/src/store/chatStore.ts` | State pagination (conversations + messages) |
| `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` | Keyset pagination conversations |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` | Pagination messages |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Handlers WebSocket + curseurs |

---

## 2. Bugs identifiés

### 🔴 Bug 1 — Détection de fin de page fragile (CRITIQUE)

**Fichier** : `front/src/store/chatStore.ts` lignes 349, 365

```typescript
// Code actuel — heuristique fragile
hasMoreMessages: messages.length >= 50,
hasMoreMessages: older.length >= 50,
```

**Problème** : si le backend renvoie exactement 50 messages sur la dernière page, `hasMoreMessages` reste `true`. L'utilisateur scrolle, un appel réseau vide est émis, et le chargement peut tourner indéfiniment.

**Correction** : faire retourner un champ `hasMore` explicite par le backend (comme c'est déjà fait pour les conversations) et l'utiliser dans le store :

```typescript
hasMoreMessages: !!payload.hasMore,
```

---

### 🔴 Bug 2 — Chargements de messages dupliqués (CRITIQUE)

**Fichier** : `front/src/components/chat/ChatMessages.tsx` lignes ~40-50

```typescript
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      handleLoadMore(); // ← appelé plusieurs fois si l'intersection dure
    }
  }, { threshold: 0.1 });
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [handleLoadMore]); // ← handleLoadMore change à chaque rendu → observer recréé
```

**Problèmes** :
1. Aucune vérification de `isLoadingMore` → plusieurs requêtes parallèles possibles.
2. `handleLoadMore` est instable (recréé à chaque rendu) → l'observer est détruit et recréé en boucle.

**Correction** :

```typescript
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !isLoadingMore && hasMoreMessages) {
      handleLoadMore();
    }
  }, { threshold: 0.1 });
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [isLoadingMore, hasMoreMessages]); // handleLoadMore via useCallback stable
```

---

### 🟡 Bug 3 — Pagination locale obsolète dans ConversationList (MOYEN)

**Fichier** : `front/src/components/sidebar/ConversationList.tsx` lignes 6-78

```typescript
const INITIAL_VISIBLE = 50;
const LOAD_MORE_STEP = 30;
// ...
const localHasMore = visibleCount < filteredConversations.length;
if (localHasMore) {
  setVisibleCount((c) => Math.min(c + LOAD_MORE_STEP, ...));
} else if (hasMoreConversations && !isLoadingMoreConversations) {
  loadMoreConversations();
}
```

**Problème** : logique hybride (pagination locale + pagination serveur) complexe et source de bugs. Si l'utilisateur scrolle vite, plusieurs `setVisibleCount` s'accumulent. Quand le filtre change, le reset de `visibleCount` (ligne ~31) peut interagir mal avec le curseur serveur.

**Correction** : supprimer `INITIAL_VISIBLE`, `LOAD_MORE_STEP`, `visibleCount`. Utiliser uniquement la pagination serveur (keyset) comme défini dans le CDC.

---

### 🟡 Bug 4 — Observer recréé excessivement dans ConversationList (MOYEN)

**Fichier** : `front/src/components/sidebar/ConversationList.tsx` lignes 36-56

```typescript
useEffect(() => {
  // ...
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [
  filteredConversations.length, // ← change souvent
  visibleCount,
  hasMoreConversations,
  isLoadingMoreConversations,
  loadMoreConversations,
]);
```

**Problème** : `filteredConversations.length` change à chaque mise à jour de la liste → l'observer est détruit et recréé en permanence, ce qui peut provoquer des flickers ou des chargements dupliqués.

**Correction** : retirer `filteredConversations.length` et `visibleCount` des dépendances (ils ne pilotent pas la logique serveur).

```typescript
}, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);
```

---

### 🟢 Bug 5 — `hasMore` explicite absent pour les messages (MINEUR)

**Fichiers** : `whatsapp_message.service.ts` + `whatsapp_message.gateway.ts`

Le backend charge `limit` messages mais ne retourne pas de champ `hasMore` pour les messages, contrairement aux conversations (qui chargent `limit + 1` et exposent `hasMore`).

**Correction** : aligner le comportement :
1. `findBychat_id()` charge `limit + 1`.
2. Si `results.length > limit` → `hasMore = true`, retirer le dernier élément.
3. Le gateway émet `{ messages, hasMore }` dans `MESSAGE_LIST` et `MESSAGE_LIST_PREPEND`.
4. Le store utilise `payload.hasMore` au lieu de `messages.length >= 50`.

---

### 🟢 Bug 6 — Rate limiting peut bloquer un scroll rapide (MINEUR)

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` ligne ~462

Le throttle `{ maxRequests: 10, windowMs: 10_000 }` est raisonnable pour un usage normal. Cependant, avec la pagination locale qui émet potentiellement plusieurs `conversations:get` rapprochés (Bug 3), la limite peut être atteinte et l'utilisateur voit ses chargements silencieusement bloqués.

**Correction** : corriger les Bugs 3 et 4 en priorité — le rate limiting redeviendra suffisant.

---

## 3. État de l'architecture backend

| Composant | État |
|-----------|------|
| Keyset pagination conversations (`findByPosteId`) | ✅ Correct |
| Index DB `IDX_chat_poste_activity` | ✅ Présent |
| Bulk queries `findLastMessagesBulk` | ✅ Optimisé |
| Cursor `nextCursor` conversations dans gateway | ✅ Correct |
| `hasMore` conversations | ✅ Retourné explicitement |
| Pagination messages (`findBychat_id`) | ⚠️ Pas de `hasMore` explicite |
| Rate limiting WebSocket | ✅ En place |

---

## 4. Conformité au cahier des charges

| Exigence | Statut | Remarque |
|----------|--------|----------|
| EF-01 Chargement initial conversations | ✅ | |
| EF-02 Scroll infini conversations | ⚠️ | Code de pagination locale obsolète à supprimer |
| EF-03 Chargement messages au clic | ✅ | |
| EF-04 Compteurs globaux non-lus | ✅ | |
| EF-05 Contacts dérivés | ✅ | |
| EF-06 Recherche avec cursor reset | ✅ | |
| EF-07 Filtres locaux + compteurs | ⚠️ | À vérifier que les totaux viennent bien du store |

---

## 5. Plan de correction recommandé

| Priorité | Action | Fichier(s) |
|----------|--------|-----------|
| 1 | Ajouter guard `!isLoadingMore` dans l'observer ChatMessages | `ChatMessages.tsx` |
| 2 | Faire retourner `hasMore` explicite par le backend pour les messages | `whatsapp_message.service.ts`, `whatsapp_message.gateway.ts` |
| 3 | Utiliser `payload.hasMore` dans le store (supprimer heuristique `>= 50`) | `chatStore.ts` |
| 4 | Supprimer la pagination locale de ConversationList | `ConversationList.tsx` |
| 5 | Réduire les dépendances du useEffect de l'observer ConversationList | `ConversationList.tsx` |
