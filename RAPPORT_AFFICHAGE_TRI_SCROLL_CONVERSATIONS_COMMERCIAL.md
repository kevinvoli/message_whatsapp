# Rapport - affichage, tri, filtres et scroll infini des conversations du front commercial

Date : 2026-05-25  
Scope : front commercial `front/src/app/whatsapp/page.tsx`, sidebar conversations, store Zustand, WebSocket et backend de chargement conversations.

## 1. Résumé exécutif

Le front commercial affiche les conversations depuis trois listes distinctes en mémoire :

| Onglet UI | Source front | Requête WebSocket | Filtre backend |
|---|---|---|---|
| Tous | `conversations` | `conversations:get` avec `tab: 'tous'` | conversations du poste, triées par activité |
| Non lus | `conversationsUnread` | `conversations:get` avec `unreadOnly: true`, `tab: 'unread'` | `chat.unread_count > 0` |
| Nouveaux | `conversationsNouveau` | `conversations:get` avec `nouveauOnly: true`, `tab: 'nouveau'` | `chat.last_poste_message_at IS NULL` |

Le tri principal est basé sur `last_activity_at DESC`, puis `chat_id DESC`. Le scroll infini existe réellement, mais il concerne surtout l'onglet `Tous`. Les onglets `Non lus` et `Nouveaux` sont préchargés en une seule réponse serveur avec une limite large de 5 000 conversations, puis `hasMore` est forcé à `false`.

La meilleure approche à garder est donc :

1. conserver des listes séparées par onglet ;
2. garder le filtrage `Non lus` et `Nouveaux` côté serveur ;
3. réserver le scroll infini à `Tous`, sauf si les volumes dépassent réellement 5 000 sur les onglets filtrés ;
4. aligner strictement les compteurs, les listes et les règles de lecture sur une seule définition métier ;
5. renforcer le tri et la cohérence temps réel quand une conversation est mise à jour.

## 2. Fichiers analysés

### Front commercial

- `front/src/app/whatsapp/page.tsx`
- `front/src/components/sidebar/Sidebar.tsx`
- `front/src/components/sidebar/ConversationFilters.tsx`
- `front/src/components/sidebar/ConversationList.tsx`
- `front/src/store/chatStore.ts`
- `front/src/components/WebSocketEvents.tsx`
- `front/src/types/chat.ts`

### Backend WebSocket / conversations

- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

### Documents déjà présents et pertinents

- `PLAN_CORRECTION_UNREAD_FILTRE_FRONT.md`
- `PLAN_CORRECTION_CONVERTI_NOUVEAU_FILTRE.md`
- `PLAN_BADGES_FILTRES_CONVERSATIONS.md`

## 3. Fonctionnement actuel côté front

### 3.1 Page principale WhatsApp

La page `front/src/app/whatsapp/page.tsx` pilote :

- le filtre actif via `filterStatus`, limité à `all`, `unread`, `nouveau` ;
- la recherche via `searchQuery` ;
- la vue active `conversations` ou `contacts` ;
- la sélection de conversation ;
- le choix de la liste à afficher.

Le choix de la liste est simple :

```ts
switch (filterStatus) {
  case 'unread':  return conversationsUnread;
  case 'nouveau': return conversationsNouveau;
  default:        return conversations;
}
```

Ce point est sain : le front ne refiltre plus localement toute la liste `Tous` pour produire `Non lus` ou `Nouveaux`. Les onglets filtrés ont leur propre source de données.

### 3.2 Chargement initial et recherche

Le chargement initial est déclenché dans `front/src/components/WebSocketEvents.tsx`, via `refreshAfterConnect()` :

- `loadConversations()`
- `loadUnreadConversations()`
- `loadNouveauConversations()`
- `contacts:get`

Quand l'utilisateur tape dans la recherche, `front/src/app/whatsapp/page.tsx` relance les trois requêtes après un debounce de 300 ms :

- `loadConversations(search)`
- `loadUnreadConversations(search)`
- `loadNouveauConversations(search)`

Avantage : les trois onglets restent cohérents avec la recherche active.

Point de vigilance : côté backend, la recherche est actuellement appliquée après la récupération SQL de la page, par filtrage en mémoire. Pour `Tous`, cela désactive `hasMore`, donc la recherche ne parcourt pas forcément tout l'historique si le terme recherché est hors des 300 premières conversations récupérées.

## 4. Filtres "Tous", "Non lus", "Nouveaux"

### 4.1 Onglet "Tous"

Source front : `conversations`.

Payload envoyé :

```ts
{ tab: 'tous', search?: string }
```

Backend :

- récupère les conversations du poste ;
- trie par `last_activity_at DESC`, puis `chat_id DESC` ;
- limite à 300 par page ;
- renvoie `hasMore` et `nextCursor`.

Comportement attendu : c'est l'onglet principal, paginé en scroll infini.

### 4.2 Onglet "Non lus"

Source front : `conversationsUnread`.

Payload envoyé :

```ts
{ unreadOnly: true, tab: 'unread', search?: string }
```

Backend :

- ajoute `chat.unread_count > 0` ;
- passe la limite effective à 5 000 ;
- ignore le curseur ;
- force `hasMore = false`.

Le compteur affiché dans le bouton `Non lus` vient de `totalUnread`, mis à jour par `TOTAL_UNREAD_UPDATE`.

Risque principal : le filtre serveur utilise la colonne `chat.unread_count`, alors que l'affichage réel des badges peut être recalculé avec `countUnreadMessagesBulk`. Si ces deux sources divergent, la liste et le compteur peuvent diverger. Les plans existants identifient déjà cette dette.

### 4.3 Onglet "Nouveaux"

Source front : `conversationsNouveau`.

Payload envoyé :

```ts
{ nouveauOnly: true, tab: 'nouveau', search?: string }
```

Backend :

- ajoute `chat.last_poste_message_at IS NULL` ;
- passe la limite effective à 5 000 ;
- ignore le curseur ;
- force `hasMore = false`.

Définition métier actuelle : une conversation est "nouvelle" tant qu'aucun message de poste/commercial n'a été envoyé (`last_poste_message_at IS NULL`).

Point important : cette définition inclut potentiellement des conversations anciennes sans réponse commerciale, même si elles ont beaucoup d'activité client. Si le métier veut plutôt "nouvelle conversation récemment assignée", il faut ajouter une autre règle, par exemple `createdAt` ou `last_client_message_at` dans une fenêtre de temps.

## 5. Tri des conversations

### 5.1 Tri serveur

Dans `WhatsappChatService.findByPosteId()`, le tri SQL est :

```ts
.orderBy('chat.last_activity_at', 'DESC')
.addOrderBy('chat.chat_id', 'DESC')
```

Ce tri est adapté au chat : la conversation la plus récemment active doit remonter.

Le curseur de pagination reprend la même logique :

```ts
{
  activityAt: (last.last_activity_at ?? last.createdAt).toISOString(),
  chatId: last.chat_id,
}
```

La requête suivante utilise :

```sql
chat.last_activity_at < :activityAt
OR (chat.last_activity_at = :activityAt AND chat.chat_id < :chatId)
```

Cette stratégie est une pagination keyset. Elle est meilleure qu'un `offset` pour les listes de conversations, car elle reste plus stable et plus performante quand le volume augmente.

### 5.2 Tri front après événements temps réel

Le store trie localement dans plusieurs cas :

- `addMessage()` met à jour `lastMessage`, `last_activity_at`, `unreadCount`, puis retrie par activité ;
- `updateConversation()` met à jour une conversation existante puis retrie ;
- `appendConversations()` fusionne les pages et garde la version la plus fraîche quand une conversation revient.

Point positif : `updateConversation()` préserve déjà `last_activity_at` existant si un UPSERT arrive sans valeur exploitable :

```ts
last_activity_at:
  conversationWithUnread.last_activity_at
  ?? c.last_activity_at
  ?? conversationWithUnread.updatedAt
```

Ce fallback évite qu'une conversation récemment active redescende dans la liste à cause d'un événement incomplet.

### 5.3 Risque restant sur `appendConversations()`

`appendConversations()` fusionne via une `Map`, mais ne retrie pas explicitement après fusion. L'ordre d'insertion de la `Map` conserve d'abord les conversations déjà présentes, puis ajoute les nouvelles. Cela fonctionne souvent parce que les nouvelles pages arrivent déjà dans l'ordre serveur, mais ce n'est pas garanti si une conversation existante est remplacée par une version plus fraîche.

Recommandation : ajouter un tri final dans `appendConversations()` après la fusion :

```ts
const merged = Array.from(existingMap.values()).sort((a, b) => {
  const aTime = a.last_activity_at?.getTime() ?? a.updatedAt.getTime();
  const bTime = b.last_activity_at?.getTime() ?? b.updatedAt.getTime();
  return bTime - aTime;
});
```

## 6. Scroll infini

### 6.1 Implémentation actuelle

Le scroll infini est dans `front/src/components/sidebar/ConversationList.tsx`.

Le composant place un sentinel en bas de liste :

```tsx
<div ref={sentinelRef} className="h-8 ...">
  {isLoadingMoreConversations ? 'Chargement...' : ''}
</div>
```

Un `IntersectionObserver` déclenche `loadMoreConversations()` quand le sentinel entre dans la zone visible :

- `hasMoreConversations === true`
- `isLoadingMoreConversations === false`
- sentinel visible

Le store envoie ensuite :

```ts
socket.emit("conversations:get", {
  cursor: conversationCursor,
  search?: currentSearch,
});
```

### 6.2 Limites actuelles

Le scroll infini ne porte que sur l'état global :

- `hasMoreConversations`
- `conversationCursor`
- `isLoadingMoreConversations`

Ces états correspondent à l'onglet `Tous`.

Pour `Non lus` et `Nouveaux`, le backend force `hasMore = false`. Le scroll infini n'a donc pas de rôle réel sur ces onglets.

Cela est cohérent avec l'architecture actuelle : les onglets filtrés sont chargés en "grosse page" jusqu'à 5 000 conversations.

### 6.3 Auto-load limité

`ConversationList.tsx` contient aussi un auto-load limité quand un filtre produit moins de 10 résultats. Mais le code le désactive explicitement pour les onglets préchargés serveur :

```ts
if (filterStatus === 'unread' || filterStatus === 'nouveau') return;
```

Donc l'auto-load restant concerne surtout `Tous`, notamment quand une recherche ou une liste initiale ne remplit pas assez l'écran.

### 6.4 Recommandation sur le scroll infini

La meilleure manière de faire dépend du volume réel :

| Volume filtré | Recommandation |
|---|---|
| Moins de 5 000 non lus/nouveaux par poste | Garder le chargement complet des onglets filtrés |
| Plus de 5 000 non lus/nouveaux possible | Ajouter une pagination par onglet |
| Recherche globale nécessaire sur tout l'historique | Déplacer la recherche dans SQL avant pagination |

Pour l'état actuel du projet, le meilleur compromis est :

- scroll infini uniquement pour `Tous` ;
- `Non lus` et `Nouveaux` chargés côté serveur sans pagination ;
- prévoir une évolution vers des curseurs séparés par onglet si le volume dépasse 5 000.

## 7. Problèmes et risques identifiés

### P0 - Cohérence des compteurs non lus

Le compteur `totalUnread`, le filtre `unreadOnly` et le badge par conversation doivent tous utiliser la même définition.

Définition recommandée :

```sql
m.from_me = 0
AND m.status IN ('sent', 'delivered')
AND m.deletedAt IS NULL
AND chat.status NOT IN ('fermé', 'converti')
```

Aujourd'hui, certains chemins utilisent `chat.unread_count > 0`, d'autres recalculent par messages. Si `unread_count` est obsolète ou gonflé, l'utilisateur peut voir :

- un compteur `Non lus` incorrect ;
- des conversations avec `0` non lu dans l'onglet non lus ;
- des différences admin / commercial.

### P1 - Recherche appliquée après pagination

Dans `sendConversationsToClientInternal()`, le backend récupère d'abord les conversations, puis applique :

```ts
chats = chats.filter(...)
hasMore = false;
```

Conséquence : si la conversation recherchée n'est pas dans la page déjà récupérée, elle ne sera pas trouvée.

Recommandation : déplacer la recherche dans la requête SQL :

```sql
AND (LOWER(chat.name) LIKE :search OR chat.chat_id LIKE :search)
```

et garder la pagination keyset compatible avec cette recherche.

### P1 - Curseur unique pour tous les onglets

Le store ne possède qu'un seul curseur :

- `conversationCursor`
- `hasMoreConversations`
- `isLoadingMoreConversations`

C'est suffisant tant que seul `Tous` est paginé. Si `Non lus` et `Nouveaux` deviennent paginés, il faudra créer un état par onglet :

```ts
conversationTabs: {
  all: { items, cursor, hasMore, isLoadingMore },
  unread: { items, cursor, hasMore, isLoadingMore },
  nouveau: { items, cursor, hasMore, isLoadingMore },
}
```

### P1 - `appendConversations()` sans tri final garanti

La fusion garde la version la plus fraîche, mais ne garantit pas un ordre final strict si une conversation existante est remplacée.

Recommandation : trier explicitement après fusion.

### P2 - Définition métier de "Nouveau"

`last_poste_message_at IS NULL` est une bonne définition technique pour "jamais répondu par le poste". Mais ce n'est pas forcément la même chose que "nouveau lead".

Questions métier à trancher :

- une conversation sans réponse depuis 3 semaines est-elle encore "nouvelle" ?
- une conversation convertie sans réponse commerciale doit-elle apparaître dans "Nouveaux" ?
- une conversation fermée sans réponse doit-elle apparaître ?

Recommandation : documenter la règle exacte et l'appliquer côté SQL.

## 8. Architecture recommandée

### 8.1 Modèle cible court terme

Conserver l'architecture actuelle avec trois listes :

```ts
conversations          // Tous, paginé
conversationsUnread    // Non lus, préchargé serveur
conversationsNouveau   // Nouveaux, préchargé serveur
```

Pourquoi :

- faible changement ;
- comportement déjà proche de la cible ;
- évite de filtrer localement sur des pages incomplètes ;
- réduit le risque de manquer des non lus ou nouveaux.

Améliorations à faire :

1. déplacer la recherche dans SQL ;
2. aligner la définition unread partout ;
3. ajouter un tri final dans `appendConversations()` ;
4. exclure explicitement les statuts non visibles dans les compteurs ;
5. clarifier la règle métier "nouveau".

### 8.2 Modèle cible moyen terme

Passer à un store par onglet :

```ts
type ConversationTabKey = 'all' | 'unread' | 'nouveau';

type ConversationTabState = {
  items: Conversation[];
  cursor: ConversationCursor | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  loadedSearch: string;
};
```

Avantages :

- chaque onglet peut avoir son propre scroll infini ;
- plus de confusion entre le `hasMore` de Tous et l'affichage de Non lus/Nouveaux ;
- possibilité de lazy-load un onglet seulement quand l'utilisateur clique dessus ;
- meilleure maîtrise des gros volumes.

Payload recommandé :

```ts
{
  tab: 'all' | 'unread' | 'nouveau',
  search?: string,
  cursor?: { activityAt: string; chatId: string },
  limit?: number
}
```

Le backend déduit les filtres depuis `tab`, au lieu de recevoir plusieurs booléens :

```ts
if (tab === 'unread') {
  // règle unread unique
}

if (tab === 'nouveau') {
  // règle nouveau unique
}
```

Cela réduit les combinaisons invalides comme `unreadOnly=true` et `nouveauOnly=true`.

### 8.3 Modèle cible long terme

Créer une API de liste unifiée, même si elle reste transportée par WebSocket :

```ts
conversation:list({
  tab,
  search,
  cursor,
  limit,
  sort: 'last_activity_desc'
})
```

Réponse :

```ts
{
  tab,
  items,
  pageInfo: {
    hasMore,
    nextCursor
  },
  counters: {
    all,
    unread,
    nouveau
  }
}
```

Avantage : chaque réponse peut mettre à jour à la fois la liste et les compteurs cohérents.

## 9. Plan d'action recommandé

### Étape 1 - Stabilisation immédiate

Priorité : P0.

- Unifier la définition `unread` entre `unread_count`, `countUnreadMessagesBulk`, `getTotalUnreadForPoste` et les stats admin.
- Exclure les statuts non visibles (`fermé`, `converti`) des compteurs commerciaux si ces conversations ne sont pas affichées.
- Recalculer ou corriger les `unread_count` existants en base si nécessaire.

### Étape 2 - Fiabiliser le tri

Priorité : P1.

- Ajouter un tri final dans `appendConversations()`.
- Vérifier que tous les événements temps réel qui modifient une conversation renseignent ou préservent `last_activity_at`.
- S'assurer que `last_activity_at` est mis à jour à chaque message entrant et sortant.

### Étape 3 - Corriger la recherche

Priorité : P1.

- Déplacer `searchTerm` dans la requête SQL de `findByPosteId()`.
- Garder `hasMore` actif en mode recherche si le résultat dépasse la limite.
- Garder le curseur keyset avec la même clause de tri.

### Étape 4 - Clarifier "Nouveau"

Priorité : P2.

- Valider la définition métier.
- Si "nouveau" signifie "jamais répondu", garder `last_poste_message_at IS NULL`.
- Si "nouveau" signifie "nouveau lead récent", ajouter une fenêtre de temps ou un statut dédié.

### Étape 5 - Évolution par onglet si volume élevé

Priorité : P2/P3 selon volume réel.

- Mettre en place un état par onglet.
- Ajouter curseur et `hasMore` séparés pour `unread` et `nouveau`.
- Ne charger un onglet qu'à son ouverture si la charge initiale devient trop forte.

## 10. Tests manuels à prévoir

| Scénario | Résultat attendu |
|---|---|
| Connexion commercial | Les 3 onglets se chargent : Tous, Non lus, Nouveaux |
| Onglet Tous | Liste triée par dernière activité décroissante |
| Scroll en bas de Tous | Une page supplémentaire de 300 conversations est ajoutée |
| Onglet Non lus | Toutes les conversations affichées ont `unreadCount > 0` |
| Ouverture d'une conversation non lue | Son badge passe à 0 et le compteur global diminue |
| Onglet Nouveaux | Toutes les conversations affichées ont `last_poste_message_at = null` |
| Recherche d'un nom ancien | La conversation est trouvée même hors des 300 premières |
| Nouveau message entrant | La conversation remonte en haut de Tous |
| Message entrant dans une conversation active | Pas d'incrément de non lus côté front |
| Plusieurs commerciaux même poste | Lecture par un commercial met à jour les compteurs des autres si requis |

## 11. Conclusion

L'architecture actuelle est globalement bonne : les onglets `Tous`, `Non lus` et `Nouveaux` sont déjà séparés et alimentés côté serveur, ce qui évite le principal piège d'un filtre local appliqué sur une liste partiellement chargée.

La meilleure manière de finaliser proprement est de ne pas tout refondre. Il faut d'abord fiabiliser les règles métier et les compteurs, puis déplacer la recherche dans SQL, puis renforcer le tri final après fusion de pages. Une pagination séparée par onglet ne devient nécessaire que si les listes `Non lus` ou `Nouveaux` dépassent réellement la limite actuelle de 5 000 conversations par poste.
