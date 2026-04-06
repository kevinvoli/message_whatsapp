# Cahier des charges — Pagination infinie des conversations
## Projet WhatsApp Commercial Platform

---

| Champ | Valeur |
|-------|--------|
| **Version** | 1.0 |
| **Date** | 2026-04-06 |
| **Référence plan** | `PLAN_PAGINATION_INFINIE.md` |
| **Stack backend** | NestJS 11, TypeORM 0.3, Socket.io 4.8, MySQL |
| **Stack frontend** | Next.js 16, React 19, Zustand 5, Socket.io-client 4.8 |

---

## 1. Contexte et justification

### 1.1 Situation actuelle

À chaque connexion d'un agent commercial, le système charge **l'intégralité** des
conversations du poste ainsi que **tous les messages** de chacune d'elles en une seule
requête. Ce comportement est bloquant et non scalable.

### 1.2 Mesures de référence

| Taille du poste | Conversations | Messages totaux | Temps de connect | Mémoire JS |
|-----------------|---------------|-----------------|------------------|------------|
| Petit | 500 | ~25 000 | ~500 ms | ~5 MB |
| Moyen | 2 000 | ~100 000 | ~2 s | ~20 MB |
| Grand | 10 000 | ~500 000 | 8–15 s | ~100 MB |

### 1.3 Objectif

Rendre le chargement initial constant quelle que soit la taille du poste :
**< 500 ms** pour les 300 premières conversations, messages chargés uniquement
à la demande.

---

## 2. Périmètre fonctionnel

### 2.1 Ce qui change

| # | Fonctionnalité | Avant | Après |
|---|---------------|-------|-------|
| F1 | Chargement initial | Toutes les conversations + tous les messages | 300 conversations, sans messages |
| F2 | Affichage conversations | Scroll local (données en mémoire) | Scroll infini backend (chargement réseau) |
| F3 | Chargement messages | Au connect (pré-chargé) | Au clic sur la conversation |
| F4 | Compteurs sidebar | Calculés depuis la liste chargée | Reçus depuis le backend (vrais totaux) |
| F5 | Contacts | Requête séparée au connect | Dérivés des conversations déjà chargées |
| F6 | Scroll contacts | Local | Couplé au scroll infini des conversations |

### 2.2 Ce qui ne change pas

- Le flux temps réel (CONVERSATION_ASSIGNED, CONVERSATION_UPSERT, MESSAGE_ADD)
- La pagination des messages dans une conversation ouverte (`messages:get` + `before`)
- La recherche textuelle (côté backend, déclenche un rechargement depuis le début)
- Le système de filtres locaux (all, unread, nouveau, urgent)
- L'authentification et la gestion des tenants
- Le panel admin (non concerné par ce cahier des charges)

---

## 3. Exigences fonctionnelles

### EF-01 — Chargement initial des conversations

**Priorité :** Critique

**Description :**  
Au moment de la connexion WebSocket d'un commercial, le backend envoie les
**300 conversations les plus récentes** du poste, triées par `last_activity_at DESC`.

**Critères d'acceptance :**
- [ ] L'event `CONVERSATION_LIST` est émis dans les **500 ms** suivant la connexion,
  quel que soit le nombre total de conversations du poste
- [ ] Le payload contient exactement 300 conversations (ou moins si le poste en a moins)
- [ ] Le payload contient `hasMore: boolean` et `nextCursor: { activityAt, chatId } | null`
- [ ] Aucun tableau `messages[]` n'est inclus dans les objets conversation
- [ ] Le tri est `last_activity_at DESC, chat_id DESC`

---

### EF-02 — Scroll infini des conversations

**Priorité :** Critique

**Description :**  
Quand l'utilisateur fait défiler la liste jusqu'en bas, le système charge automatiquement
les 50 conversations suivantes depuis le backend.

**Critères d'acceptance :**
- [ ] Un `IntersectionObserver` sur le sentinel déclenche `loadMoreConversations()`
- [ ] Le client émet `conversations:get` avec `{ limit: 50, cursor: { activityAt, chatId } }`
- [ ] Le backend retourne les 50 conversations suivant le curseur
- [ ] Les nouvelles conversations sont **ajoutées à la suite** de la liste existante
  (pas de remplacement)
- [ ] Le sentinel disparaît quand `hasMore === false`
- [ ] Un indicateur de chargement (`isLoadingMoreConversations`) est visible pendant le fetch
- [ ] Pas de doublon : une conversation déjà chargée n'apparaît pas deux fois

---

### EF-03 — Chargement des messages au clic

**Priorité :** Critique

**Description :**  
Les messages d'une conversation ne sont chargés qu'au moment où l'utilisateur clique
sur elle. Le chargement ultérieur (scroll vers le haut) reste inchangé.

**Critères d'acceptance :**
- [ ] Cliquer sur une conversation affiche immédiatement un loader
- [ ] L'event `messages:get { chat_id, limit: 50 }` est émis au clic
- [ ] Les messages s'affichent à réception de `MESSAGE_LIST`
- [ ] Le scroll vers le haut dans la conversation déclenche `messages:get { chat_id, before, limit: 50 }`
  (comportement existant, non modifié)
- [ ] Aucun message n'est pré-chargé au connect

---

### EF-04 — Compteurs globaux fiables

**Priorité :** Critique

**Description :**  
Les compteurs affichés dans la sidebar reflètent la réalité de la base de données,
indépendamment du nombre de conversations chargées côté client.

**Compteurs requis :**

| Compteur | Valeur | Affiché dans |
|----------|--------|-------------|
| Total conversations | Nb de conv. du poste (sans filtre de date) | Header sidebar — case "Conv." |
| Total conversations non lues | Nb de conv. avec ≥1 message `sent`/`delivered` entrant | Badge filtre "Non lus" |
| Total messages non lus | Somme des unread_count (pour le badge global) | Header sidebar — case "Non lus" |

**Critères d'acceptance :**
- [ ] Les 3 compteurs sont reçus dans l'event `TOTAL_UNREAD_UPDATE` au connect
- [ ] Ils sont **recalculés depuis la base de données** (pas depuis la liste paginée)
- [ ] Ils sont mis à jour en temps réel lors des événements : `MESSAGE_ADD`,
  `CONVERSATION_UPSERT`, `CONVERSATION_ASSIGNED`, `CONVERSATION_REMOVED`

---

### EF-05 — Contacts dérivés des conversations

**Priorité :** Haute

**Description :**  
La vue "Contacts" dans la sidebar est construite à partir des conversations déjà
chargées via `convToContact()`. Aucune requête backend séparée n'est émise pour
les contacts au moment de la connexion.

**Critères d'acceptance :**
- [ ] `contacts:get` n'est plus émis au connect dans `WebSocketEvents.tsx`
- [ ] `ContactSidebarPanel` utilise uniquement `useChatStore(s => s.conversations)`
- [ ] Les contacts nouvellement apparus (via scroll infini des conversations) apparaissent
  automatiquement dans la vue contacts
- [ ] Le sentinel en bas de la liste contacts déclenche `loadMoreConversations()`
  (charge plus de conversations → plus de contacts)

---

### EF-06 — Recherche

**Priorité :** Haute

**Description :**  
La recherche textuelle dans la sidebar repart du début (sans curseur) et retourne
les 50 premières conversations correspondantes.

**Critères d'acceptance :**
- [ ] Saisir un terme dans la barre de recherche émet `conversations:get { search, limit: 50 }`
  sans curseur
- [ ] La liste est entièrement remplacée par les résultats (pas d'append)
- [ ] Effacer la recherche recharge les 300 premières conversations (sans curseur)
- [ ] `hasMore` et `nextCursor` sont correctement transmis pour les résultats de recherche

---

### EF-07 — Filtres locaux

**Priorité :** Haute

**Description :**  
Les filtres (all, unread, nouveau, urgent) restent locaux et s'appliquent sur
les conversations déjà chargées en mémoire. Les compteurs dans les boutons
de filtre reflètent les vrais totaux (EF-04), pas la taille de la liste locale.

**Critères d'acceptance :**
- [ ] Bouton "Tous (N)" → N = `totalAllConversations` (backend), pas `conversations.length`
- [ ] Bouton "Non lus (N)" → N = `totalUnreadConversations` (backend)
- [ ] Les filtres `nouveau` et `urgent` affichent uniquement les conversations locales correspondantes
  (sans indicateur de total global, car non fourni par le backend)

---

## 4. Exigences techniques

### ET-01 — Algorithme de pagination : Keyset (curseur)

**Motif du choix :**  
L'offset SQL (`SKIP N`) sur une table de 10 000 lignes force MySQL à parcourir
N lignes pour les ignorer. Le keyset utilise l'index existant
`IDX_chat_poste_activity (poste_id, last_activity_at)` et maintient des
performances constantes.

**Spécification du curseur :**

```
cursor = {
  activityAt : string   // ISO 8601 — last_activity_at de la dernière conv reçue
  chatId     : string   // chat_id de la dernière conv reçue (tie-breaker)
}
```

**Clause SQL générée :**

```sql
WHERE (
  chat.last_activity_at < :cursorActivityAt
  OR (
    chat.last_activity_at = :cursorActivityAt
    AND chat.chat_id < :cursorChatId
  )
)
ORDER BY chat.last_activity_at DESC, chat.chat_id DESC
LIMIT :limit + 1
```

Le `LIMIT + 1` permet de détecter `hasMore` sans requête de comptage supplémentaire.

---

### ET-02 — Tri des conversations

**Ordre :** `last_activity_at DESC, chat_id DESC`

- `last_activity_at` est mis à jour à chaque message entrant ou sortant  
  → les conversations les plus récentes sont toujours en haut
- `chat_id` sert de tie-breaker déterministe pour le keyset

> **Changement par rapport à l'état actuel :** le tri `unread_count DESC` est
> supprimé. Les conversations non lues remontent naturellement car elles ont une
> `last_activity_at` récente (message entrant non traité).

---

### ET-03 — Payload WebSocket

#### Event émis par le backend : `chat:event`

**Type `CONVERSATION_LIST` — structure du payload :**

```typescript
{
  type: 'CONVERSATION_LIST',
  payload: {
    conversations: ConversationPayload[],  // 300 au connect, 50 au scroll
    hasMore: boolean,                      // true s'il reste des conversations
    nextCursor: {
      activityAt: string,  // ISO 8601
      chatId: string,
    } | null,              // null si hasMore === false
  }
}
```

**Type `TOTAL_UNREAD_UPDATE` — structure enrichie :**

```typescript
{
  type: 'TOTAL_UNREAD_UPDATE',
  payload: {
    totalUnread: number,                 // somme unread_count (badge header)
    totalAll: number,                    // nb total conversations du poste
    totalUnreadConversations: number,    // nb conversations avec ≥1 non lu
  }
}
```

**Champ supprimé de `ConversationPayload` :**

```typescript
// AVANT : chaque conversation incluait ses messages pré-chargés
messages?: MessagePayload[]   // ← SUPPRIMÉ

// APRÈS : aucun champ messages dans le payload de liste
```

#### Event émis par le client : `conversations:get`

```typescript
// Payload complet
{
  limit?: number,            // défaut: 50 (300 au connect)
  search?: string,           // recherche textuelle
  cursor?: {                 // absent au premier chargement
    activityAt: string,
    chatId: string,
  } | null,
}
```

---

### ET-04 — État du store Zustand (`chatStore`)

**Nouveaux champs à ajouter :**

```typescript
// Pagination conversations
isLoadingConversations     : boolean   // chargement initial
isLoadingMoreConversations : boolean   // scroll infini en cours
hasMoreConversations       : boolean   // pages suivantes disponibles
conversationsNextCursor    : { activityAt: string; chatId: string } | null

// Compteurs globaux (reçus du backend)
totalAllConversations      : number    // total réel du poste
totalUnreadConversations   : number    // conv. avec ≥1 non lu
```

**Signatures modifiées :**

```typescript
// Ancien
loadConversations  : () => void
setConversations   : (conversations: Conversation[]) => void

// Nouveau
loadConversations       : (limit?: number) => void  // 300 au connect
loadMoreConversations   : () => void                // 50 au scroll
setConversations        : (data: { conversations, hasMore, nextCursor }) => void
appendConversations     : (data: { conversations, hasMore, nextCursor }) => void
setPosteStats           : (totalAll: number, totalUnreadConversations: number) => void
```

**Modification `selectConversation` :**

```typescript
// Supprimer la logique de pré-chargement depuis conv.messages[]
// Émettre TOUJOURS messages:get au clic (plus de chemin "pré-chargé")
```

---

### ET-05 — Contraintes de performance

| Métrique | Seuil obligatoire |
|----------|-------------------|
| Temps d'émission `CONVERSATION_LIST` au connect | **< 500 ms** (poste ≤ 10 000 conv.) |
| Temps d'émission `CONVERSATION_LIST` au scroll | **< 300 ms** |
| Taille payload `CONVERSATION_LIST` initial | **< 500 KB** |
| Requêtes DB au connect | **≤ 5** (findByPosteId, findLastMessagesBulk, countUnreadMessagesBulk, findByChatIds, getStatsForPoste) |
| Mémoire JS côté client au connect | **< 10 MB** |

---

### ET-06 — Index de base de données

Les index suivants doivent être présents (déjà créés) :

```sql
-- Keyset pagination principal
INDEX IDX_chat_poste_activity (poste_id, last_activity_at)

-- Soft-delete + tri analytique
INDEX IDX_chat_poste_time (poste_id, createdAt, deletedAt)
```

Aucune migration supplémentaire n'est requise.

---

### ET-07 — Compatibilité temps réel

Les événements suivants continuent de modifier la liste en temps réel
**sans redéclencher une pagination** :

| Event | Action sur la liste |
|-------|-------------------|
| `CONVERSATION_ASSIGNED` | `addConversation()` — ajoute en tête |
| `CONVERSATION_UPSERT` | `updateConversation()` — met à jour + retri |
| `CONVERSATION_REMOVED` | `removeConversationBychat_id()` — supprime |
| `MESSAGE_ADD` | Mise à jour de `lastMessage` + retri |
| `TOTAL_UNREAD_UPDATE` | Mise à jour des compteurs globaux |

---

### ET-08 — Rate limiting

Le handler `conversations:get` est soumis au throttle existant :
`{ maxRequests: 10, windowMs: 10_000 }`.

Ce seuil est **suffisant** pour le scroll infini (un scroll complet de 10 000 conversations
nécessite 200 requêtes mais le throttle est par fenêtre de 10 s — l'utilisateur ne peut
pas scroller aussi vite).

---

## 5. Architecture des fichiers modifiés

### 5.1 Backend

```
message_whatsapp/src/
├── whatsapp_chat/
│   └── whatsapp_chat.service.ts
│       ├── findByPosteId()         ← MODIFIÉ (pagination keyset)
│       └── getStatsForPoste()      ← NOUVEAU
│
└── whatsapp_message/
    ├── whatsapp_message.service.ts
    │   └── findRecentByChatIds()   ← RETIRÉ du flow connect
    │
    └── whatsapp_message.gateway.ts
        ├── sendConversationsToClientInternal()  ← MODIFIÉ
        └── handleGetConversations()             ← MODIFIÉ
```

### 5.2 Frontend

```
front/src/
├── store/
│   └── chatStore.ts               ← MODIFIÉ (nouveaux états + actions)
│
├── components/
│   ├── WebSocketEvents.tsx        ← MODIFIÉ (CONVERSATION_LIST, TOTAL_UNREAD_UPDATE)
│   ├── sidebar/
│   │   ├── ConversationList.tsx   ← MODIFIÉ (sentinel backend)
│   │   ├── ConversationFilters.tsx ← MODIFIÉ (vrais totaux depuis store)
│   │   └── UserHeader.tsx         ← MODIFIÉ (totalAllConversations)
│   └── contacts/
│       └── ContactSidebarPanel.tsx ← MODIFIÉ (sentinel partagé)
│
└── types/
    └── chat.ts                    ← MODIFIÉ (RawConversationData sans messages[])
```

---

## 6. Contrat d'interface

### 6.1 Méthode `findByPosteId` — signature finale

```typescript
findByPosteId(
  poste_id       : string,
  excludeStatuses: string[]  = [],
  limit          : number    = 50,
  cursorActivityAt?: Date,
  cursorChatId?  : string,
): Promise<{ chats: WhatsappChat[]; hasMore: boolean }>
```

### 6.2 Méthode `getStatsForPoste` — signature finale

```typescript
getStatsForPoste(
  poste_id: string
): Promise<{
  totalAll              : number,
  totalUnreadConversations: number,
}>
```

### 6.3 Action `loadMoreConversations` — conditions de déclenchement

```
DÉCLENCHER si :
  socket !== null
  && hasMoreConversations === true
  && isLoadingMoreConversations === false
  && conversationsNextCursor !== null

NE PAS DÉCLENCHER si :
  un filtre de recherche est actif
  (la recherche repart toujours du début)
```

### 6.4 Logique de dispatch `CONVERSATION_LIST`

```
SI isLoadingMoreConversations === true au moment de la réception
  → appendConversations()   (ajout en fin de liste)
SINON
  → setConversations()      (remplacement complet)
```

---

## 7. Cas limites et comportements attendus

| Cas | Comportement attendu |
|-----|---------------------|
| Poste avec 0 conversation | `CONVERSATION_LIST { conversations: [], hasMore: false, nextCursor: null }` |
| Poste avec < 300 conversations | Toutes envoyées au connect, `hasMore: false` |
| Scroll jusqu'à la dernière conversation | Sentinel disparaît, `hasMoreConversations = false` |
| Nouvelle conversation assignée pendant le scroll | Apparaît via `CONVERSATION_ASSIGNED` en tête de liste, indépendamment de la pagination |
| Conversation mise à jour pendant le scroll | Mise à jour via `CONVERSATION_UPSERT`, position recalculée |
| Reconnexion WebSocket | Repart de zéro : `loadConversations(300)` sans curseur, liste remplacée |
| Recherche active + scroll | Le scroll charge les 50 résultats suivants de la recherche (curseur dans le contexte de la recherche) |
| Filtre local actif (ex: "non lus") | Scroll infini backend continue, filtre local s'applique sur le résultat |
| Tenant avec 0 conversation sur les 300 premières | Le filtre JS tenant réduit la liste visible, mais le chargement continue |

---

## 8. Critères de validation

### 8.1 Tests fonctionnels

| Test | Résultat attendu |
|------|-----------------|
| Connexion poste avec 10 000 conversations | `CONVERSATION_LIST` reçu en < 500 ms avec 300 conversations |
| Scroll jusqu'en bas de la liste | Chargement automatique de 50 nouvelles conversations |
| Clic sur une conversation | Messages chargés en < 200 ms, loader affiché pendant le chargement |
| Compteur "Tous (N)" | N correspond au total réel en base |
| Compteur "Non lus (N)" | N correspond aux conversations avec messages non lus en base |
| Reconnexion | Liste rechargée depuis le début, sans doublon |
| Nouvelle conversation assignée | Apparaît immédiatement en haut de la liste |

### 8.2 Tests de performance

| Test | Seuil |
|------|-------|
| Temps entre `socket.connect()` et affichage des premières conversations | < 500 ms |
| Temps de chargement d'un "load more" (50 conversations) | < 300 ms |
| Temps de chargement des messages au clic | < 200 ms |
| Mémoire JS après connect (DevTools Heap snapshot) | < 10 MB |
| Mémoire JS après scroll complet (10 000 conversations) | < 50 MB |

### 8.3 Tests de non-régression

- [ ] L'envoi de messages fonctionne toujours
- [ ] La réception de messages en temps réel fonctionne toujours
- [ ] Le changement de statut d'une conversation fonctionne toujours
- [ ] La recherche retourne des résultats corrects
- [ ] Les filtres locaux fonctionnent sur les conversations chargées
- [ ] La vue contacts affiche bien les contacts des conversations chargées
- [ ] Le scroll infini des messages dans une conversation ouverte fonctionne toujours

---

## 9. Ce qui est hors périmètre

| Sujet | Raison de l'exclusion |
|-------|----------------------|
| Virtualisation DOM (react-window) | Non nécessaire pour 300–1000 éléments affichés |
| Recherche full-text dans les messages | Feature séparée, non demandée |
| Filtres backend (unread, statut) | Les filtres restent locaux — suffisant avec 300 convs |
| WebSocket admin | Non demandé dans ce CDC |
| Cache persistant (localStorage/IndexedDB) | Complexité non justifiée à ce stade |
| Notifications push navigateur | Fonctionnalité existante non modifiée |

---

## 10. Ordre d'exécution

```
┌─────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 — Backend services (½ journée)                     │
│  ├─ whatsapp_chat.service.ts                                 │
│  │   ├─ findByPosteId() → keyset pagination                  │
│  │   └─ getStatsForPoste() → nouveau                         │
│  └─ Retirer findRecentByChatIds du flow connect              │
├─────────────────────────────────────────────────────────────┤
│  ÉTAPE 2 — Gateway WebSocket (¼ journée)                    │
│  ├─ sendConversationsToClientInternal() → nouveau flow       │
│  └─ handleGetConversations() → accept cursor + limit         │
├─────────────────────────────────────────────────────────────┤
│  ÉTAPE 3 — Store Zustand (½ journée)                        │
│  ├─ Nouveaux états de pagination                             │
│  ├─ loadMoreConversations()                                  │
│  ├─ appendConversations() / setConversations()               │
│  ├─ setPosteStats()                                          │
│  └─ selectConversation() → sans messages pré-chargés         │
├─────────────────────────────────────────────────────────────┤
│  ÉTAPE 4 — Events WebSocket frontend (¼ journée)            │
│  ├─ CONVERSATION_LIST → initial vs append                    │
│  └─ TOTAL_UNREAD_UPDATE → setPosteStats                      │
├─────────────────────────────────────────────────────────────┤
│  ÉTAPE 5 — Composants UI (½ journée)                        │
│  ├─ ConversationList → IntersectionObserver backend          │
│  ├─ ConversationFilters → vrais totaux store                 │
│  ├─ UserHeader → totalAllConversations                       │
│  └─ ContactSidebarPanel → sentinel partagé                   │
├─────────────────────────────────────────────────────────────┤
│  ÉTAPE 6 — Tests & nettoyage (¼ journée)                    │
│  ├─ Vérifier tous les critères de validation                 │
│  ├─ Supprimer code obsolète                                  │
│  └─ Commit + déploiement production                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Dépendances et prérequis

- [ ] Index `IDX_chat_poste_activity` présent en base (migration `20260401_add_chat_poste_activity_index.ts` appliquée)
- [ ] Colonne `last_activity_at` alimentée sur toutes les conversations (vérifier les NULL)
- [ ] Tests unitaires existants passent avant toute modification (`npm run test`)
- [ ] Branche dédiée créée depuis `master` avant de commencer

---

*Document généré le 2026-04-06 — référence : PLAN_PAGINATION_INFINIE.md*
