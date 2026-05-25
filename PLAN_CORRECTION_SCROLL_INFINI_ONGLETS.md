# Plan — Correction scroll infini + onglets indépendants (v2)

> **Branche :** `production`
> **Date :** 2026-05-25 (v3 — FIX-1 corrigé suite à review : pattern refs pour éviter la recréation de l'observer)
> **Statut :** 📋 À implémenter

---

## 1. Diagnostic

### 1.1 Bug principal — Cascade IntersectionObserver incontrôlée (P0)

**Mécanisme :**

`ConversationList.tsx` place un `IntersectionObserver` sur un sentinel en bas de liste :

```typescript
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
      loadMoreConversations();
    }
  });
  observer.observe(sentinel);
}, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations, conversationCursor]);
//  ↑ TOUTES ces dépendances causent le bug ↑
```

**Trois déclencheurs de recréation de l'observer, tous problématiques :**

| Dépendance | Quand change | Conséquence |
|---|---|---|
| `conversationCursor` | À chaque page chargée | Observer recréé → si sentinel visible → fire immédiat |
| `isLoadingMoreConversations` | Quand une page **finit** de charger (repasse `false`) | Observer recréé → si sentinel visible → fire immédiat |
| `hasMoreConversations` | Au chargement initial | Observer recréé une première fois |

**Avant l'implémentation des 3 onglets :** changer d'onglet appelait `loadConversations(_, unreadOnly=true)` → `setConversations(5000, hasMore=false)` → `hasMoreConversations = false` → sentinel retiré du DOM → cascade stoppée.

**Après :** `hasMoreConversations` reste `true` en permanence. Chaque fois qu'une page finit de charger (`isLoadingMoreConversations` repasse à `false`), l'observer est recréé. Si le sentinel est encore visible, il fire immédiatement. La cascade continue jusqu'à épuisement des pages.

**Scénario type avec 2000 conversations :**
1. Page charge → 300 convs → `hasMore=true`, `cursor=X1`
2. `isLoadingMoreConversations` repasse à `false` → observer recréé → sentinel visible → fire
3. 600 convs → `isLoadingMoreConversations` repasse à `false` → observer recréé → fire
4. … → toutes les 2000 conversations chargées en quelques secondes

---

### 1.2 Bug secondaire — Sentinel rendu sur les onglets non paginés (P0)

Quand `filterStatus` est `'unread'` ou `'nouveau'`, la liste affiche `conversationsUnread` ou `conversationsNouveau`. Mais `hasMoreConversations` reste `true` → le sentinel est **rendu** en bas de ces listes.

Si l'utilisateur scrolle jusqu'en bas d'un onglet non paginé :
- `loadMoreConversations()` fire → charge des pages de l'onglet "Tous" en arrière-plan
- `conversationCursor` change → relance la cascade du bug 1.1

---

### 1.3 Bug tertiaire — `loadMoreConversations` sans `tab` (P1)

```typescript
// chatStore.ts — loadMoreConversations
const payload = { cursor: conversationCursor };  // ← tab absent
socket.emit("conversations:get", payload);
```

La réponse arrive avec `tab: undefined`. Le routing vers `appendConversations` fonctionne via `isLoadingMoreConversations`, mais c'est fragile et incohérent avec le reste.

---

### 1.4 Bug mineur — Message vide "Nouveaux" jamais affiché (P2)

```tsx
// ConversationList.tsx ligne 98
{filterStatus === 'nouveau' && filteredCount === 0 && autoLoadCountRef.current >= 3 && !hasMoreConversations && (
```

`autoLoadCountRef.current` vaut toujours `0` pour l'onglet "Nouveaux" (early return avant incrément). Le message n'apparaît jamais.

---

### 1.5 Dette technique — `appendConversations()` sans tri final garanti (P1)

Extrait du rapport :

> `appendConversations()` fusionne via une `Map`, mais ne retrie pas explicitement après fusion. L'ordre d'insertion de la `Map` conserve d'abord les conversations déjà présentes, puis ajoute les nouvelles. Cela fonctionne souvent parce que les nouvelles pages arrivent dans l'ordre serveur, mais ce n'est pas garanti si une conversation existante est remplacée par une version plus fraîche.

```typescript
// chatStore.ts — appendConversations, état actuel
const merged = Array.from(existingMap.values());  // ← PAS de tri final
```

---

### 1.6 Dette technique — Recherche appliquée après pagination, pas dans SQL (P1)

Extrait du rapport :

> Dans `sendConversationsToClientInternal()`, le backend récupère d'abord les conversations, puis applique : `chats = chats.filter(...)` / `hasMore = false`.
> Conséquence : si la conversation recherchée n'est pas dans la page déjà récupérée, elle ne sera pas trouvée.

```typescript
// gateway — sendConversationsToClientInternal
if (searchTerm) {
  chats = chats.filter(c =>
    c.name.toLowerCase().includes(lowerSearch) || c.chat_id.includes(lowerSearch)
  );
  hasMore = false;  // ← pagination désactivée : la page suivante ne sera jamais demandée
}
```

La recherche côté front déclenche les 3 requêtes (tous / unread / nouveau), mais seules les conversations déjà dans la page SQL sont filtrées. Un terme correspondant à une conversation plus ancienne ne sera pas trouvé.

---

## 2. Corrections

### FIX-1 — Stabiliser l'observer avec des refs ✦ CRITIQUE P0

**Fichier :** `front/src/components/sidebar/ConversationList.tsx`

**Principe :** découpler la durée de vie de l'observer des valeurs dynamiques (`hasMoreConversations`, `isLoadingMoreConversations`). L'observer est recréé **uniquement** lors d'un changement d'onglet (`filterStatus`) ou de la fonction `loadMoreConversations`. Les valeurs booléennes dynamiques sont lues via des `refs` toujours à jour, sans déclencher de recréation.

```typescript
// AVANT — 4 dépendances qui recréent l'observer à chaque page chargée
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
      loadMoreConversations();
    }
  }, { threshold: 0.1 });
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations, conversationCursor]);

// APRÈS — pattern refs : l'observer est stable, les valeurs dynamiques passent par des refs
const hasMoreRef = useRef(hasMoreConversations);
const loadingRef = useRef(isLoadingMoreConversations);

// Effet 1 : maintenir les refs à jour sans recréer l'observer
useEffect(() => {
  hasMoreRef.current = hasMoreConversations;
  loadingRef.current = isLoadingMoreConversations;
}, [hasMoreConversations, isLoadingMoreConversations]);

// Effet 2 : observer stable, recréé seulement au changement d'onglet
useEffect(() => {
  if (filterStatus !== 'all') return;    // guard : sentinel non rendu hors onglet "Tous"

  const sentinel = sentinelRef.current;
  if (!sentinel) return;

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    if (!hasMoreRef.current || loadingRef.current) return;
    loadMoreConversations();
  }, { threshold: 0.1 });

  observer.observe(sentinel);
  return () => observer.disconnect();
}, [filterStatus, loadMoreConversations]);
```

**Pourquoi ce pattern résout la cascade :**
- `hasMoreConversations` et `isLoadingMoreConversations` ne sont plus dans les deps de l'effet observer → leur changement ne recrée plus l'observer
- `conversationCursor` est supprimé → la fin de chaque page ne recrée plus l'observer
- L'observer est recréé **uniquement** au changement de `filterStatus` (retour sur "Tous") ou si `loadMoreConversations` change (jamais en pratique)
- La callback lit `hasMoreRef.current` et `loadingRef.current` qui sont toujours synchronisés via l'effet 1

**Pourquoi le guard `filterStatus !== 'all'` en plus de FIX-2 :** double sécurité — même si le sentinel était rendu par erreur sur un autre onglet, l'effet retourne immédiatement.

---

### FIX-2 — Conditionner le sentinel à `filterStatus === 'all'` ✦ CRITIQUE P0

**Fichier :** `front/src/components/sidebar/ConversationList.tsx`

```tsx
// AVANT
{hasMoreConversations && (
  <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
    {isLoadingMoreConversations ? 'Chargement…' : ''}
  </div>
)}

// APRÈS
{hasMoreConversations && filterStatus === 'all' && (
  <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
    {isLoadingMoreConversations ? 'Chargement…' : ''}
  </div>
)}
```

**Pourquoi :** les onglets "Non lus" et "Nouveaux" sont préchargés côté serveur sans pagination. Aucun sentinel n'est nécessaire. Quand `sentinelRef.current === null`, l'effet retourne immédiatement (`if (!sentinel) return`) → `loadMoreConversations()` ne peut plus être déclenché sur ces onglets.

---

### FIX-3 — `tab: 'tous'` dans `loadMoreConversations` + fallback défensif (P1)

**Fichier :** `front/src/store/chatStore.ts`

```typescript
// AVANT
loadMoreConversations: () => {
  const payload: { cursor: ConversationCursor; search?: string } = { cursor: conversationCursor };
  if (currentSearch) payload.search = currentSearch;
  socket.emit("conversations:get", payload);
},

// APRÈS
loadMoreConversations: () => {
  const payload: { cursor: ConversationCursor; search?: string; tab: string } = {
    cursor: conversationCursor,
    tab: 'tous',
  };
  if (currentSearch) payload.search = currentSearch;
  socket.emit("conversations:get", payload);
},
```

**Pourquoi `tab: 'tous'` :** routing explicite, cohérent avec les autres actions.

**Note importante (review) :** conserver le fallback `isLoadingMoreConversations` dans le handler `CONVERSATION_LIST` côté `WebSocketEvents.tsx` pour compatibilité défensive. Si une réponse arrive avec `tab: undefined` (ancienne version ou reconnexion), le fallback prend le relais :

```typescript
// WebSocketEvents.tsx — handler CONVERSATION_LIST, partie else (tab 'tous' ou undefined)
} else {
  // Routing explicite via tab: 'tous', fallback sur isLoadingMoreConversations (compat défensive)
  if (chatState.isLoadingMoreConversations) {
    chatState.appendConversations(convArray, hasMore, nextCursor);
  } else {
    chatState.setConversations(convArray, hasMore, nextCursor);
  }
}
```

→ Ce code est déjà en place, **ne pas le supprimer**.

---

### FIX-4 — Tri final dans `appendConversations()` (P1)

**Fichier :** `front/src/store/chatStore.ts`

```typescript
// AVANT
const merged = Array.from(existingMap.values());

// APRÈS
const merged = Array.from(existingMap.values()).sort((a, b) => {
  const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
  const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
  return bTime - aTime;
});
```

**Pourquoi :** sans ce tri, si une conversation existante est remplacée par une version plus fraîche lors de la fusion, elle reste à sa position d'origine au lieu de remonter. Le tri garantit que la liste reste dans l'ordre `last_activity_at DESC` après chaque append.

---

### FIX-5 — Recherche dans SQL plutôt qu'après pagination (P1)

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Dans `sendConversationsToClientInternal`, remplacer le filtrage en mémoire par un filtre SQL ajouté dans `findByPosteId`.

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` — `findByPosteId`

```typescript
// AJOUTER dans le QueryBuilder, avant la clause cursor
if (searchTerm) {
  qb.andWhere(
    '(LOWER(chat.name) LIKE :search OR chat.chat_id LIKE :search)',
    { search: `%${searchTerm.toLowerCase()}%` },
  );
}
```

**Signature `findByPosteId` :** ajouter `searchTerm?: string` après `nouveauOnly`.

**Dans `sendConversationsToClientInternal` :** supprimer le bloc de filtrage en mémoire :

```typescript
// SUPPRIMER ce bloc
if (searchTerm) {
  const lowerSearch = searchTerm.toLowerCase();
  chats = chats.filter(...);
  hasMore = false;
}
```

Passer `searchTerm` à `findByPosteId` à la place. Conserver la désactivation du cursor quand `searchTerm` est défini (ou accepter la pagination keyset sur la recherche, ce qui est plus correct).

**Pourquoi :** la recherche actuelle ne trouve que les conversations dans la première page SQL. Avec la recherche dans SQL, la pagination keyset reste active et toutes les conversations matchant le terme sont trouvées.

---

### FIX-6 — Message vide "Nouveaux" via `isLoadingNouveau` (P2)

**Fichier :** `front/src/components/sidebar/ConversationList.tsx`

Ajouter la lecture du store :
```typescript
const isLoadingNouveau = useChatStore((s) => s.isLoadingNouveau);
```

Remplacer la condition :
```tsx
// AVANT
{filterStatus === 'nouveau' && filteredCount === 0 && autoLoadCountRef.current >= 3 && !hasMoreConversations && (
  <p>Aucune nouvelle conversation parmi les conversations chargées.</p>
)}

// APRÈS
{filterStatus === 'nouveau' && filteredCount === 0 && !isLoadingNouveau && (
  <p className="text-xs text-gray-400 text-center py-4 px-3">
    Aucune nouvelle conversation.
  </p>
)}
```

---

## 3. Récapitulatif

| Fix | Fichier(s) | Priorité | Impact |
|---|---|---|---|
| **FIX-1** | `ConversationList.tsx` — pattern refs, observer stable sur `[filterStatus, loadMoreConversations]` | P0 ✦ | Supprime **totalement** la cascade (ni `cursor`, ni `isLoadingMore`, ni `hasMore` dans les deps) |
| **FIX-2** | `ConversationList.tsx` — sentinel conditionnel `filterStatus === 'all'` | P0 ✦ | Empêche `loadMoreConversations` sur les onglets non paginés |
| **FIX-3** | `chatStore.ts` — `tab: 'tous'` dans `loadMoreConversations` + fallback défensif conservé | P1 | Routing explicite et robuste |
| **FIX-4** | `chatStore.ts` — tri final dans `appendConversations()` | P1 | Ordre stable après chaque page chargée |
| **FIX-5** | `whatsapp_chat.service.ts` + `gateway.ts` — recherche dans SQL (**commit séparé**) | P1 | Trouve toutes les conversations, pas seulement les 300 premières |
| **FIX-6** | `ConversationList.tsx` — message vide "Nouveaux" via `isLoadingNouveau` | P2 | UX correcte quand 0 nouvelle conversation |

**Séquence recommandée (review) :**
- **Commit 1 :** FIX-1 + FIX-2 + FIX-3 + FIX-4 + FIX-6 (frontend, 2 fichiers)
- **Commit 2 :** FIX-5 séparé (backend, modifie la signature de `findByPosteId` → vérification de tous les appels)

**Frontend : 2 fichiers** (`ConversationList.tsx`, `chatStore.ts`)
**Backend : 2 fichiers** (`whatsapp_chat.service.ts`, `gateway.ts`) — commit séparé

---

## 4. Schéma du comportement corrigé

```
Onglet "Tous" (filterStatus='all') :
  ├── conversations = 300 items (paginés)
  ├── sentinel rendu ✓ (filterStatus === 'all')
  ├── IntersectionObserver actif ✓
  └── Scroll manuel → loadMoreConversations(tab:'tous') → append → tri final

Onglet "Non lus" (filterStatus='unread') :
  ├── conversationsUnread = tous les non-lus préchargés (5000 max)
  ├── sentinel NON rendu (filterStatus ≠ 'all')
  ├── IntersectionObserver inactif (sentinelRef.current = null)
  └── Aucune requête de pagination déclenchée

Onglet "Nouveaux" (filterStatus='nouveau') :
  ├── conversationsNouveau = toutes les nouvelles préchargées (5000 max)
  ├── sentinel NON rendu
  ├── IntersectionObserver inactif
  └── Si liste vide : message "Aucune nouvelle conversation."

Changement "Non lus" → "Tous" :
  ├── filterStatus change → useEffect([..., filterStatus]) re-run
  ├── sentinel rendu → sentinelRef.current non-null
  ├── Nouvel observer créé et attaché
  └── Si sentinel visible → loadMoreConversations() (scroll attendu)

Recherche :
  ├── Debounce 300ms → 3 requêtes parallèles
  ├── Filtre dans SQL (LIKE) sur les 3 onglets
  └── Pagination keyset conservée sur l'onglet "Tous"
```

---

## 5. Note sur l'architecture — Évolution recommandée (rapport §8.2)

L'architecture actuelle (3 listes plates + un seul curseur pour "Tous") est correcte pour l'état présent. Le rapport recommande, si les volumes dépassent 5 000 conversations non lues ou nouvelles, de migrer vers un **store par onglet** :

```typescript
type ConversationTabState = {
  items: Conversation[];
  cursor: ConversationCursor | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
};

conversationTabs: Record<'all' | 'unread' | 'nouveau', ConversationTabState>
```

**Ce refactoring est hors scope de ce plan.** À planifier séparément si les volumes le justifient.

---

## 6. Note sur la définition métier de "Nouveau" (rapport §7 P2)

La règle actuelle : `last_poste_message_at IS NULL` = jamais répondu par le poste commercial.

Questions métier non tranchées à documenter :
- Une conversation sans réponse depuis 3 semaines est-elle encore "nouvelle" ?
- Une conversation `converti` ou `fermé` sans réponse doit-elle apparaître dans "Nouveaux" ?

→ Hors scope de ce plan. À trancher avec le métier avant toute modification.

---

## 7. Tests manuels

| Scénario | Résultat attendu après correction |
|---|---|
| Page load → onglet "Tous" | 300 conversations, indicateur "Chargement…" visible si hasMore |
| Scroll jusqu'en bas de "Tous" | 300 conversations supplémentaires ajoutées, ordre stable |
| Onglet "Non lus" | Toutes les conversations non lues, pas de scroll infini |
| Scroll jusqu'en bas de "Non lus" | Rien ne se passe |
| Onglet "Nouveaux" | Toutes les nouvelles conversations, pas de scroll infini |
| Retour sur "Tous" après "Non lus" | Sentinel réapparu, scroll infini fonctionnel |
| 0 nouvelle conversation | Message "Aucune nouvelle conversation." affiché |
| Recherche "dupont" | Toutes les conversations matchant, y compris au-delà de la page 1 |
| Nouveau message entrant | Conversation remonte en tête de "Tous" (tri `last_activity_at DESC`) |

---

*Plan créé le 2026-05-25 — v2 : intégration rapport RAPPORT_AFFICHAGE_TRI_SCROLL_CONVERSATIONS_COMMERCIAL.md (tri appendConversations, recherche SQL, note architecture, note métier "nouveau")*
