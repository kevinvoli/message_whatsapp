# Plan d'implémentation — Pagination infinie des conversations

**Date :** 2026-04-06  
**Objectif :** Remplacer le chargement total des conversations par un système paginé  
avec scroll infini, tri par dernière activité, et chargement des messages au clic.

---

## Contexte & problème actuel

### Ce qui se passe aujourd'hui

Au moment de la connexion WebSocket d'un commercial, le backend exécute
`sendConversationsToClientInternal()` qui :

1. Appelle `findByPosteId(posteId, [])` → **retourne TOUTES les conversations du poste sans LIMIT**
2. Appelle `findRecentByChatIds(chatIds)` → **charge TOUS les messages de TOUTES ces conversations**  
   (`SELECT … FROM whatsapp_message WHERE chat_id IN (…)` sans LIMIT)
3. Construit un payload géant et l'envoie au client en une seule émission `CONVERSATION_LIST`

**Côté frontend**, `ConversationList.tsx` simule un scroll infini *local* (50 + 30 par chunk)
mais **toutes les données sont déjà en mémoire** — aucun appel réseau supplémentaire.

### Chiffres du problème

| Scénario | Conversations | Messages | Rows chargées | Temps estimé |
|----------|-------------|---------|--------------|-------------|
| Petit poste | 500 | ~50 msgs/conv | ~25 000 | ~500 ms |
| Poste moyen | 2 000 | ~50 msgs/conv | ~100 000 | ~2 s |
| Gros poste | 10 000 | ~50 msgs/conv | ~500 000 | ~8-15 s |

### Ce qu'il faut atteindre

- Charger les **300 conversations les plus récentes** (par `last_activity_at DESC`) au connect
- Afficher en **temps réel** : total des conversations, total non lus (compteur),  
  total conversations avec non lus (badge)
- Scroll infini : charger +50 à chaque fin de liste jusqu'au total complet
- Messages **chargés au clic** sur une conversation (pas au connect)
- Contacts dérivés des conversations déjà chargées (déjà fonctionnel via `convToContact`)

---

## Architecture cible

```
CONNECT
  └─ Backend envoie les 300 premières conversations (last_activity_at DESC)
     + hasMore: true/false
     + nextCursor: last_activity_at de la 300e conversation
     + totalAll: nombre total de conversations du poste
     + totalUnread: nombre de conversations avec messages non lus

SCROLL vers le bas (client émet conversations:get avec after=cursor)
  └─ Backend retourne les 50 suivantes
     + hasMore + nextCursor mis à jour

CLIC sur une conversation
  └─ Client émet messages:get { chat_id }
     Backend retourne les 50 derniers messages (déjà implémenté)
     Scroll en haut de la conversation → messages:get { chat_id, before=cursor }

CONTACTS
  └─ Dérivés des conversations chargées (convToContact) — pas de requête séparée
     Scroll infini sur les contacts = même mécanique que les conversations
     (utilise la liste conversations déjà paginée)
```

---

## Phase 1 — Backend : service `WhatsappChatService`

### Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

#### 1.1 Modifier `findByPosteId` — ajouter pagination par curseur

**Actuellement (ligne 50-68) :**
```typescript
async findByPosteId(
  poste_id: string,
  excludeStatuses: string[] = ['fermé', 'converti'],
): Promise<WhatsappChat[]> {
  // ... getMany() sans LIMIT
}
```

**Nouveau :**
```typescript
async findByPosteId(
  poste_id: string,
  excludeStatuses: string[] = ['fermé', 'converti'],
  limit: number = 50,
  // Cursor keyset : on passe la last_activity_at + chat_id de la dernière conversation reçue
  // Cela évite les problèmes de skip/offset sur les grandes tables
  cursorActivityAt?: Date,
  cursorChatId?: string,
): Promise<{ chats: WhatsappChat[]; hasMore: boolean }> {
  const qb = this.chatRepository
    .createQueryBuilder('chat')
    .leftJoinAndSelect('chat.poste', 'poste')
    .leftJoinAndSelect('chat.channel', 'channel')
    .where('chat.poste_id = :poste_id', { poste_id })
    // Tri : last_activity_at DESC, chat_id DESC comme tie-breaker
    .orderBy('chat.last_activity_at', 'DESC')
    .addOrderBy('chat.chat_id', 'DESC');

  if (excludeStatuses.length > 0) {
    qb.andWhere('chat.status NOT IN (:...excludeStatuses)', { excludeStatuses });
  }

  // Keyset pagination : prendre tout ce qui est AVANT le curseur
  if (cursorActivityAt && cursorChatId) {
    qb.andWhere(
      `(chat.last_activity_at < :cursorActivityAt
        OR (chat.last_activity_at = :cursorActivityAt AND chat.chat_id < :cursorChatId))`,
      { cursorActivityAt, cursorChatId },
    );
  }

  // Charger limit+1 pour détecter s'il y a une page suivante
  const chats = await qb.take(limit + 1).getMany();

  const hasMore = chats.length > limit;
  if (hasMore) chats.pop();

  return { chats, hasMore };
}
```

**Pourquoi keyset et pas offset ?**  
Avec 10 000 conversations, `OFFSET 5000` force MySQL à parcourir 5 000 lignes pour les ignorer.  
Le keyset (`WHERE last_activity_at < :cursor`) utilise l'index `IDX_chat_poste_activity` déjà en place  
→ performances constantes quelle que soit la profondeur de pagination.

#### 1.2 Ajouter `getStatsForPoste` — compteurs globaux sans filtre de pagination

Cette méthode centralise les 3 compteurs affichés en haut de la sidebar commerciale.

```typescript
async getStatsForPoste(poste_id: string): Promise<{
  totalAll: number;
  totalUnreadConversations: number; // conversations avec ≥1 msg non lu
}> {
  const stats = await this.chatRepository
    .createQueryBuilder('chat')
    .select('COUNT(*)', 'totalAll')
    .addSelect(
      `SUM(CASE WHEN EXISTS (
         SELECT 1 FROM whatsapp_message m
         WHERE m.chat_id = chat.chat_id
           AND m.from_me = 0
           AND m.status IN ('sent','delivered')
           AND m.deletedAt IS NULL
       ) THEN 1 ELSE 0 END)`,
      'totalUnreadConversations',
    )
    .where('chat.poste_id = :poste_id', { poste_id })
    .andWhere('chat.deletedAt IS NULL')
    .getRawOne<{ totalAll: string; totalUnreadConversations: string }>();

  return {
    totalAll: parseInt(stats?.totalAll ?? '0') || 0,
    totalUnreadConversations: parseInt(stats?.totalUnreadConversations ?? '0') || 0,
  };
}
```

> **Note :** `getTotalUnreadForPoste()` (ligne 70) reste utilisé par le gateway pour
> `TOTAL_UNREAD_UPDATE`. `getStatsForPoste()` est appelé une seule fois au connect
> et lors des événements qui modifient le total (nouvelle conv assignée, conv fermée).

---

## Phase 2 — Backend : service `WhatsappMessageService`

### Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

#### 2.1 Supprimer le pré-chargement massif dans `findRecentByChatIds`

**Actuellement (ligne 551-574) :** charge TOUS les messages de TOUTES les conversations  
sans aucune limite — c'est la cause principale du problème de performance.

**Nouveau :** ne plus l'appeler au connect. Les messages seront chargés au clic via  
`messages:get` (déjà implémenté avec pagination). Supprimer l'appel dans le gateway.

Si un aperçu du dernier message est nécessaire dans la sidebar (résumé), il est déjà
fourni par `findLastMessagesBulk()` (ligne 524) qui est rapide et ciblé.

> `findRecentByChatIds` peut être gardé pour d'autres usages futurs mais ne doit plus
> être appelé dans `sendConversationsToClientInternal`.

---

## Phase 3 — Backend : Gateway `WhatsappMessageGateway`

### Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

#### 3.1 Modifier `sendConversationsToClientInternal` (lignes 303-384)

**Changements :**
- Accepter `limit`, `cursorActivityAt`, `cursorChatId` en paramètres
- Supprimer l'appel à `findRecentByChatIds` (messages plus pré-chargés)
- Émettre `hasMore`, `nextCursor`, `totalAll`, `totalUnreadConversations` dans le payload

```typescript
private async sendConversationsToClientInternal(
  client: Socket,
  agent: { posteId: string; tenantIds: string[] },
  searchTerm?: string,
  limit: number = 300,
  cursorActivityAt?: Date,
  cursorChatId?: string,
) {
  const { chats: rawChats, hasMore } = await this.chatService.findByPosteId(
    agent.posteId,
    [],
    limit,
    cursorActivityAt,
    cursorChatId,
  );

  let chats = rawChats;

  // Filtre tenant
  if (agent.tenantIds.length > 0) {
    const tenantSet = new Set(agent.tenantIds);
    chats = chats.filter((c) => !c.tenant_id || tenantSet.has(c.tenant_id));
  }

  // Filtre recherche textuelle
  if (searchTerm) {
    const lowerSearch = searchTerm.toLowerCase();
    chats = chats.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerSearch) ||
        c.chat_id.includes(lowerSearch),
    );
  }

  const chatIds = chats.map((c) => c.chat_id);

  // Bulk fetch : last message + unread count + contact
  // (pas de findRecentByChatIds — messages chargés au clic)
  const [lastMsgMap, unreadMap, contactMap] = await Promise.all([
    this.messageService.findLastMessagesBulk(chatIds),
    this.messageService.countUnreadMessagesBulk(chatIds),
    this.contactService.findByChatIds(chatIds),
  ]);

  const conversations = chats.map((chat) =>
    this.mapConversationWithContact(
      chat,
      lastMsgMap.get(chat.chat_id) ?? null,
      unreadMap.get(chat.chat_id) ?? chat.unread_count ?? 0,
      contactMap.get(chat.chat_id),
    ),
  );

  // Curseur pour la prochaine page
  const lastChat = chats[chats.length - 1];
  const nextCursor = hasMore && lastChat
    ? {
        activityAt: lastChat.last_activity_at?.toISOString() ?? null,
        chatId: lastChat.chat_id,
      }
    : null;

  client.emit('chat:event', {
    type: 'CONVERSATION_LIST',
    payload: {
      conversations,
      hasMore,
      nextCursor,     // { activityAt: string, chatId: string } | null
    },
  });

  // Compteurs globaux (sans filtre de pagination — vrais totaux)
  const [totalUnread, stats] = await Promise.all([
    this.chatService.getTotalUnreadForPoste(agent.posteId),
    this.chatService.getStatsForPoste(agent.posteId),
  ]);

  client.emit('chat:event', {
    type: 'TOTAL_UNREAD_UPDATE',
    payload: {
      totalUnread,                                             // nb de msgs non lus (pour badge)
      totalAll: stats.totalAll,                               // nb total de conversations
      totalUnreadConversations: stats.totalUnreadConversations, // nb de conv avec non lus
    },
  });
}
```

#### 3.2 Modifier le handler `conversations:get` (lignes 457-466)

```typescript
@SubscribeMessage('conversations:get')
async handleGetConversations(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload?: {
    search?: string;
    limit?: number;
    // Curseur de la dernière conversation reçue
    cursor?: { activityAt: string; chatId: string } | null;
  },
) {
  if (!this.throttle.allow(client.id, 'conversations:get')) {
    return this.emitRateLimited(client, 'conversations:get');
  }
  const agent = this.connectedAgents.get(client.id);
  if (!agent) return;

  await this.sendConversationsToClientInternal(
    client,
    agent,
    payload?.search,
    payload?.limit ?? 50,
    payload?.cursor?.activityAt ? new Date(payload.cursor.activityAt) : undefined,
    payload?.cursor?.chatId,
  );
}
```

**Note :** Au connect (handleConnection, ligne 153), appeler avec `limit=300` et sans curseur
pour le chargement initial. Les pages suivantes utilisent `limit=50`.

#### 3.3 Supprimer l'émission de `contacts:get` au connect (WebSocketEvents.tsx ligne 35)

Les contacts sont déjà dérivés des conversations via `convToContact` dans `ContactSidebarPanel`.
L'event `contacts:get` / `CONTACT_LIST` devient inutile pour la liste initiale.  
Il peut rester pour des cas spécifiques (rechargement forcé) mais ne doit plus être  
émis systématiquement au connect.

---

## Phase 4 — Frontend : Store `chatStore.ts`

### Fichier : `front/src/store/chatStore.ts`

#### 4.1 Nouveaux champs d'état

```typescript
interface ChatState {
  // --- EXISTANTS ---
  socket: Socket | null;
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  messageIdCache: Record<string, Set<string>>;
  replyToMessage: Message | null;
  totalUnread: number;
  typingStatus: Record<string, boolean>;

  // --- NOUVEAUX ---
  isLoadingConversations: boolean;        // chargement initial en cours
  isLoadingMoreConversations: boolean;    // "load more" en cours (scroll)
  hasMoreConversations: boolean;          // il reste des conversations à charger
  conversationsNextCursor: { activityAt: string; chatId: string } | null;
  totalAllConversations: number;          // total réel du poste (affiché dans le header)
  totalUnreadConversations: number;       // nb de conversations avec ≥1 non lu (badge)

  // --- ACTIONS EXISTANTES (signatures modifiées) ---
  loadConversations: (limit?: number) => void;  // limit=300 par défaut

  // --- NOUVELLES ACTIONS ---
  loadMoreConversations: () => void;
  appendConversations: (data: {
    conversations: Conversation[];
    hasMore: boolean;
    nextCursor: { activityAt: string; chatId: string } | null;
  }) => void;
  setPosteStats: (totalAll: number, totalUnreadConversations: number) => void;
}
```

#### 4.2 Modifier `loadConversations`

```typescript
loadConversations: (limit = 300) => {
  const { socket } = get();
  if (!socket) return;
  set({ isLoadingConversations: true });
  socket.emit('conversations:get', { limit });
  // Pas de cursor → chargement depuis le début
},
```

#### 4.3 Nouvelle action `loadMoreConversations`

```typescript
loadMoreConversations: () => {
  const {
    socket,
    isLoadingMoreConversations,
    hasMoreConversations,
    conversationsNextCursor,
  } = get();

  if (!socket || isLoadingMoreConversations || !hasMoreConversations || !conversationsNextCursor) {
    return;
  }

  set({ isLoadingMoreConversations: true });
  socket.emit('conversations:get', {
    limit: 50,
    cursor: conversationsNextCursor,
  });
},
```

#### 4.4 Modifier `setConversations` → remplacé par deux actions distinctes

**`setConversations`** (chargement initial — remplace la liste complète) :
```typescript
setConversations: (data: {
  conversations: Conversation[];
  hasMore: boolean;
  nextCursor: { activityAt: string; chatId: string } | null;
}) => {
  set((state) => {
    const selectedChatId = state.selectedConversation?.chat_id;
    const normalized = selectedChatId
      ? data.conversations.map((c) =>
          c.chat_id === selectedChatId ? { ...c, unreadCount: 0 } : c,
        )
      : data.conversations;

    // Plus de pré-chargement de messages depuis la liste (messages chargés au clic)
    return {
      conversations: normalized,
      isLoadingConversations: false,
      hasMoreConversations: data.hasMore,
      conversationsNextCursor: data.nextCursor,
    };
  });
},
```

**`appendConversations`** (scroll infini — ajoute à la suite) :
```typescript
appendConversations: (data) => {
  set((state) => {
    const existingIds = new Set(state.conversations.map((c) => c.chat_id));
    const newOnes = data.conversations.filter((c) => !existingIds.has(c.chat_id));
    return {
      conversations: [...state.conversations, ...newOnes],
      isLoadingMoreConversations: false,
      hasMoreConversations: data.hasMore,
      conversationsNextCursor: data.nextCursor,
    };
  });
},
```

#### 4.5 Nouvelle action `setPosteStats`

```typescript
setPosteStats: (totalAll, totalUnreadConversations) => {
  set({ totalAllConversations: totalAll, totalUnreadConversations });
},
```

#### 4.6 Modifier `selectConversation` — supprimer les messages pré-chargés

```typescript
selectConversation: (chat_id: string) => {
  set((state) => {
    const conversation = state.conversations.find((c) => c.chat_id === chat_id);
    if (!conversation) return state;

    return {
      selectedConversation: { ...conversation, unreadCount: 0 },
      conversations: state.conversations.map((c) =>
        c.chat_id === chat_id ? { ...c, unreadCount: 0 } : c,
      ),
      messages: [],            // Toujours vider — les messages arrivent via messages:get
      isLoading: true,         // Afficher le loader pendant le chargement
      isLoadingMore: false,
      hasMoreMessages: true,
      messageIdCache: {
        ...state.messageIdCache,
        [chat_id]: new Set<string>(),
      },
      replyToMessage: null,
    };
  });

  const socket = get().socket;
  socket?.emit('messages:get', { chat_id, limit: 50 });   // Chargement des messages au clic
  socket?.emit('messages:read', { chat_id });
},
```

---

## Phase 5 — Frontend : Gestion des événements WebSocket

### Fichier : `front/src/components/WebSocketEvents.tsx`

#### 5.1 Modifier le handler `CONVERSATION_LIST` (ligne 138)

```typescript
case 'CONVERSATION_LIST': {
  const { conversations: rawList, hasMore, nextCursor } = data.payload as {
    conversations: any[];
    hasMore: boolean;
    nextCursor: { activityAt: string; chatId: string } | null;
  };

  const conversations: Conversation[] = rawList.map(transformToConversation);

  // Si isLoadingMoreConversations est true → on est en mode "load more"
  const isAppend = useChatStore.getState().isLoadingMoreConversations;

  if (isAppend) {
    chatState.appendConversations({ conversations, hasMore, nextCursor });
  } else {
    chatState.setConversations({ conversations, hasMore, nextCursor });
  }
  break;
}
```

#### 5.2 Modifier le handler `TOTAL_UNREAD_UPDATE` (ligne 144)

```typescript
case 'TOTAL_UNREAD_UPDATE': {
  const payload = data.payload as {
    totalUnread: number;
    totalAll?: number;
    totalUnreadConversations?: number;
  };
  setTotalUnread(payload.totalUnread);
  if (payload.totalAll !== undefined && payload.totalUnreadConversations !== undefined) {
    chatState.setPosteStats(payload.totalAll, payload.totalUnreadConversations);
  }
  break;
}
```

#### 5.3 Supprimer l'émission de `contacts:get` au connect (ligne 35)

```typescript
const refreshAfterConnect = () => {
  loadConversations(300);   // 300 premières conversations au connect
  // socket.emit('contacts:get');  ← SUPPRIMER (contacts dérivés des conversations)

  const selectedChatId = useChatStore.getState().selectedConversation?.chat_id;
  if (selectedChatId) {
    socket.emit('messages:get', { chat_id: selectedChatId });
  }
};
```

---

## Phase 6 — Frontend : Composants UI

### 6.1 `ConversationList.tsx` — scroll infini backend

**Actuellement** (ligne 6-68) : le scroll infini est *local* (slicing de `filteredConversations`).  
**Nouveau** : le sentinel déclenche `loadMoreConversations()` qui émet un événement WebSocket.

```typescript
export default function ConversationList({
  filteredConversations,
  selectedConversation,
  onSelectConversation,
  selectedConv,
}: ConversationListProps) {
  const typingStatus             = useChatStore((s) => s.typingStatus);
  const loadMoreConversations    = useChatStore((s) => s.loadMoreConversations);
  const isLoadingMoreConversations = useChatStore((s) => s.isLoadingMoreConversations);
  const hasMoreConversations     = useChatStore((s) => s.hasMoreConversations);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Observer sur le sentinel en bas de liste
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
          loadMoreConversations();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);

  return (
    <div className="flex-1 overflow-y-auto">
      {filteredConversations.map((conv) => (
        <ConversationItem
          key={conv.chat_id}
          conversation={conv}
          isSelected={selectedConversation?.chat_id === conv.chat_id}
          isTyping={!!typingStatus[conv.chat_id]}
          onClick={() => onSelectConversation(conv)}
        />
      ))}

      {/* Sentinel : trigger automatique au scroll */}
      {hasMoreConversations && (
        <div
          ref={sentinelRef}
          className="h-10 flex items-center justify-center text-xs text-gray-400"
        >
          {isLoadingMoreConversations ? (
            <span className="animate-pulse">Chargement…</span>
          ) : (
            <span>↓ Faire défiler pour voir plus</span>
          )}
        </div>
      )}
    </div>
  );
}
```

### 6.2 `ConversationFilters.tsx` — afficher les vrais totaux

**Actuellement** : `Tous ({conversations.length})` = nombre de conversations filtrées.  
**Nouveau** : utiliser `totalAllConversations` depuis le store.

```typescript
export default function ConversationFilters({
  conversations,
  totalUnread,
  filterStatus,
  setFilterStatus,
}: ConversationFiltersProps) {
  const totalAll      = useChatStore((s) => s.totalAllConversations);
  const totalUnreadConv = useChatStore((s) => s.totalUnreadConversations);

  return (
    <div className="p-3 border-b border-gray-200 bg-gray-50">
      <div className="p-2 flex items-center gap-2 overflow-x-auto">
        <button onClick={() => setFilterStatus('all')} ...>
          Tous ({totalAll})      {/* ← vrai total du poste */}
        </button>
        <button onClick={() => setFilterStatus('unread')} ...>
          Non lus ({totalUnreadConv})   {/* ← nb de conversations avec non lus */}
        </button>
        <button onClick={() => setFilterStatus('nouveau')} ...>
          Nouveaux
        </button>
        <button onClick={() => setFilterStatus('urgent')} ...>
          Urgents
        </button>
      </div>
    </div>
  );
}
```

### 6.3 `UserHeader.tsx` — stats dans le header

Remplacer `conversation?.length` (ligne 121) par `totalAllConversations` du store :

```typescript
// Avant
{conversation?.length}

// Après
{useChatStore((s) => s.totalAllConversations)}
```

### 6.4 `ContactSidebarPanel.tsx` — scroll infini sur les contacts

Les contacts sont déjà dérivés de `conversations` via `convToContact`.  
Avec la pagination des conversations, la liste de contacts grandit naturellement  
au fur et à mesure des scrolls.

Pour ajouter un scroll infini dédié sur la liste contacts, brancher le même
sentinel sur `loadMoreConversations` :

```typescript
// Dans ContactSidebarPanel
const loadMoreConversations    = useChatStore((s) => s.loadMoreConversations);
const isLoadingMoreConversations = useChatStore((s) => s.isLoadingMoreConversations);
const hasMoreConversations     = useChatStore((s) => s.hasMoreConversations);

const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && hasMoreConversations && !isLoadingMoreConversations) {
        loadMoreConversations();  // charge plus de conversations → plus de contacts
      }
    },
    { threshold: 0.1 },
  );
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [hasMoreConversations, isLoadingMoreConversations, loadMoreConversations]);

// En bas de la liste
{hasMoreConversations && (
  <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-gray-400">
    {isLoadingMoreConversations ? 'Chargement…' : '↓ Plus de contacts'}
  </div>
)}
```

---

## Phase 7 — Filtres front : adaptation à la pagination

### Problème

Les filtres (`filterStatus`) s'appliquent localement sur `conversations[]` du store.  
Avec la pagination, les conversations filtrées (`fermé`, `non lus`, etc.) peuvent  
ne pas toutes être chargées — le filtre local ne montre qu'un sous-ensemble.

### Solution adoptée

**Filtres locaux** (sur les conversations déjà chargées) — comportement actuel conservé :
- `all` → toutes les conversations chargées
- `unread` → `conv.unreadCount > 0`
- `nouveau` → `conv.status === 'attente'`
- `urgent` → `conv.priority === 'haute'`

**Compteurs globaux** depuis le store (non affectés par le filtre) :
- `totalAllConversations` → vrai total du poste (backend)
- `totalUnreadConversations` → vrai nb de conv avec non lus (backend)

> Les compteurs restent exacts même si toutes les conversations ne sont pas encore
> chargées. La liste filtrée peut être incomplète mais le total est toujours fiable.

---

## Phase 8 — Nettoyage

| Action | Fichier | Détail |
|--------|---------|--------|
| Supprimer `findRecentByChatIds` du flow connect | `whatsapp_message.gateway.ts` lignes 341-345 | Plus de pré-chargement massif |
| Supprimer `contacts:get` au connect | `WebSocketEvents.tsx` ligne 35 | Contacts dérivés des conversations |
| Supprimer `INITIAL_VISIBLE` / `LOAD_MORE_STEP` | `ConversationList.tsx` lignes 6-7 | Remplacé par scroll infini backend |
| Supprimer `messageIdCache` pré-chargé depuis la liste | `chatStore.ts` `setConversations` | Messages chargés au clic |
| Supprimer `messages[]` dans le payload `CONVERSATION_LIST` | `whatsapp_message.gateway.ts` lignes 354-370 | Plus envoyés avec les conversations |

---

## Ordre d'implémentation recommandé

```
Étape 1 — Backend core (½ journée)
  ├─ findByPosteId → pagination keyset
  ├─ getStatsForPoste → nouveau
  └─ sendConversationsToClientInternal → nouveau flow sans messages
  
Étape 2 — Gateway WebSocket (¼ journée)
  ├─ Handler conversations:get → accept cursor
  └─ Émission TOTAL_UNREAD_UPDATE enrichi

Étape 3 — Store frontend (½ journée)
  ├─ Nouveaux états (hasMoreConversations, cursor, stats)
  ├─ loadMoreConversations
  ├─ appendConversations / setConversations (nouvelles signatures)
  └─ selectConversation → plus de messages pré-chargés

Étape 4 — WebSocketEvents.tsx (¼ journée)
  ├─ CONVERSATION_LIST → initial vs append
  └─ TOTAL_UNREAD_UPDATE → setPosteStats

Étape 5 — UI (½ journée)
  ├─ ConversationList → sentinel backend
  ├─ ConversationFilters → vrais totaux
  ├─ UserHeader → totalAllConversations
  └─ ContactSidebarPanel → sentinel partagé

Étape 6 — Tests & nettoyage (¼ journée)
  ├─ Vérifier scroll, compteurs, filtres
  └─ Supprimer code obsolète
```

---

## Gains de performance attendus

| Métrique | Avant | Après |
|---------|-------|-------|
| Données chargées au connect | O(N convs × M msgs) | 300 convs × 0 msg = **300 rows** |
| Temps connect (10k convs) | 8-15 s | **< 500 ms** |
| Mémoire JS initiale | ~50-100 MB | **< 5 MB** |
| Chargement d'une conv (clic) | Instantané (déjà en mémoire) | ~100 ms (50 msgs depuis DB) |
| Scroll infini (load more) | Local (déjà en mémoire) | ~200 ms (50 convs depuis DB) |
| Contacts | Requête séparée au connect | **0 requête** (dérivés des convs) |

---

## Points d'attention

1. **Index DB** : `IDX_chat_poste_activity` (`poste_id`, `last_activity_at`) est déjà en place  
   (`20260401_add_chat_poste_activity_index.ts`) — le keyset pagination en bénéficie directement.

2. **Filtre tenant** : le filtrage tenant se fait en JS après le fetch (ligne 315-319 du gateway).  
   Si le tenant filtre beaucoup de conversations, la page effective peut être < 300.  
   Solution future : intégrer le filtre tenant dans la requête SQL.

3. **Recherche** : la recherche textuelle (`conversations:get { search }`) repart de 0  
   (pas de cursor) et charge les 50 premiers résultats correspondants.

4. **Temps réel** : les events `CONVERSATION_ASSIGNED`, `CONVERSATION_UPSERT`, `CONVERSATION_REMOVED`  
   ne sont pas affectés par ce plan — ils continuent de modifier la liste en temps réel.

5. **`preloaded messages`** supprimés : `chatStore.selectConversation` ne vérifie plus  
   `conv.messages.length > 0` pour éviter l'appel réseau. **Tous les clics sur une  
   conversation déclenchent `messages:get`** — comportement plus simple et plus fiable.
