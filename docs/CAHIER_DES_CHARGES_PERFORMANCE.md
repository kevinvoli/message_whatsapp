# Cahier des charges — Optimisation des performances
**Projet** : WhatsApp CRM
**Date** : 2026-03-31
**Contexte** : Deux surfaces sont concernées : (1) la vue analytique admin qui rame avec le volume de données, (2) l'interface des commerciaux qui charge lentement les conversations et les messages. Ce document couvre les deux.

---

## Résumé des priorités

| Phase | Surface | Solution | Impact | Complexité | Délai estimé |
|---|---|---|---|---|---|
| **P0** | Interface commerciaux | Élimination N+1 gateway + pagination messages | ★★★★★ | Faible | 1 jour |
| **P1** | Analytics admin | Stats snapshot + Cron | ★★★★★ | Faible | 1-2 jours |
| **P2** | Les deux | Redis cache distribué | ★★★★☆ | Moyenne | 2-3 jours |
| **P3** | Interface commerciaux | Virtualisation liste + lazy loading | ★★★★☆ | Moyenne | 2-3 jours |
| **P4** | Les deux | Incremental counters (Event-driven) | ★★★☆☆ | Moyenne | 3-4 jours |
| **P5** | Analytics admin | TimescaleDB / ClickHouse | ★★★★★ | Élevée | 1-2 semaines |

---

---

# PHASE 0 — Interface commerciaux : élimination des bottlenecks critiques (URGENCE)

## Diagnostic — Problèmes identifiés dans le code actuel

### Problème 0-A : N+1 massif dans `sendConversationsToClient` (gateway)

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` ligne 294

```typescript
// CODE ACTUEL — PROBLÉMATIQUE
const conversations = await Promise.all(
  chats.map(async (chat) => {
    // 1 requête SQL par chat pour le dernier message
    const lastMessage = await this.messageService.findLastMessageBychat_id(chat.chat_id);
    // 1 requête SQL par chat pour le compteur non-lu
    const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);
    return this.mapConversation(chat, lastMessage, unreadCount);
  }),
);
```

**Impact** : Pour 50 conversations → **100 requêtes SQL** exécutées séquentiellement à chaque connexion d'un commercial ou rafraîchissement de la liste.

### Problème 0-B : Chargement de TOUS les messages dans `findByPosteId`

**Fichier** : `src/whatsapp_chat/whatsapp_chat.service.ts` ligne 51

```typescript
// CODE ACTUEL — PROBLÉMATIQUE
relations: ['poste', 'messages', 'channel'] // ← charge TOUS les messages de TOUTES les conversations
```

**Impact** : Si un poste a 50 conversations avec 200 messages chacune → **10 000 messages** chargés en mémoire pour juste afficher la liste de la sidebar.

### Problème 0-C : Messages sans pagination dans `messages:get`

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` ligne 512

```typescript
const messages = await this.messageService.findBychat_id(payload.chat_id);
// Retourne TOUS les messages d'une conversation — potentiellement 2000+
```

**Impact** : Ouverture d'une ancienne conversation = chargement de l'historique complet → lenteur + mémoire JS saturée.

### Problème 0-D : Double filtrage côté frontend

**Fichiers** : `front/src/app/whatsapp/page.tsx` ET `front/src/components/sidebar/Sidebar.tsx`

Les conversations sont filtrées deux fois (par status + par recherche textuelle) dans deux composants différents, produisant des calculs redondants à chaque rendu.

---

## Corrections P0-A : Bulk-fetch last message + unread count

### Backend — `WhatsappMessageService`

Ajouter deux nouvelles méthodes de bulk-fetch :

```typescript
// Retourne le dernier message pour une liste de chat_ids en UNE seule requête
async findLastMessagesBulk(chatIds: string[]): Promise<Map<string, WhatsappMessage>> {
  if (chatIds.length === 0) return new Map();
  const rows = await this.messageRepository
    .createQueryBuilder('m')
    .innerJoin(
      (sub) => sub
        .select('m2.chat_id', 'cid')
        .addSelect('MAX(m2.timestamp)', 'max_ts')
        .from(WhatsappMessage, 'm2')
        .where('m2.chat_id IN (:...chatIds)', { chatIds })
        .andWhere('m2.deletedAt IS NULL')
        .groupBy('m2.chat_id'),
      'latest',
      'm.chat_id = latest.cid AND m.timestamp = latest.max_ts AND m.deletedAt IS NULL',
    )
    .where('m.chat_id IN (:...chatIds)', { chatIds })
    .getMany();
  return new Map(rows.map((m) => [m.chat_id, m]));
}

// Retourne les compteurs non-lus pour une liste de chat_ids en UNE seule requête
async countUnreadMessagesBulk(chatIds: string[]): Promise<Map<string, number>> {
  if (chatIds.length === 0) return new Map();
  const rows: Array<{ chat_id: string; cnt: string }> = await this.messageRepository
    .createQueryBuilder('m')
    .select('m.chat_id', 'chat_id')
    .addSelect('COUNT(*)', 'cnt')
    .where('m.chat_id IN (:...chatIds)', { chatIds })
    .andWhere("m.direction = 'IN'")
    .andWhere("m.status != 'read'")
    .andWhere('m.deletedAt IS NULL')
    .groupBy('m.chat_id')
    .getRawMany();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.chat_id, parseInt(r.cnt) || 0);
  return map;
}
```

### Backend — `sendConversationsToClient` (gateway)

Remplacer le `Promise.all` avec N+1 par les deux bulk-fetch :

```typescript
private async sendConversationsToClient(client: Socket, searchTerm?: string) {
  // ... récupération des chats (sans la relation messages)
  const chatIds = chats.map((c) => c.chat_id);

  // 2 requêtes au lieu de 2N
  const [lastMsgMap, unreadMap] = await Promise.all([
    this.messageService.findLastMessagesBulk(chatIds),
    this.messageService.countUnreadMessagesBulk(chatIds),
  ]);

  const conversations = chats.map((chat) =>
    this.mapConversation(
      chat,
      lastMsgMap.get(chat.chat_id) ?? null,
      unreadMap.get(chat.chat_id) ?? 0,
    ),
  );

  client.emit('chat:event', { type: 'CONVERSATION_LIST', payload: conversations });
}
```

**Résultat** : 2N+1 requêtes → **3 requêtes** (findByPosteId + lastMsgBulk + unreadBulk).

---

## Corrections P0-B : Supprimer le chargement des messages dans `findByPosteId`

**Fichier** : `src/whatsapp_chat/whatsapp_chat.service.ts`

```typescript
// AVANT
relations: ['poste', 'messages', 'channel']

// APRÈS
relations: ['poste', 'channel']
// Les messages sont chargés séparément via bulk-fetch dans le gateway
```

---

## Corrections P0-C : Pagination des messages

### Backend — `WhatsappMessageService`

Modifier `findBychat_id` pour accepter une pagination :

```typescript
async findBychat_id(
  chat_id: string,
  limit = 50,       // 50 derniers messages par défaut
  before?: Date,    // curseur pour le scroll infini
): Promise<WhatsappMessage[]> {
  const qb = this.messageRepository
    .createQueryBuilder('m')
    .where('m.chat_id = :chat_id', { chat_id })
    .andWhere('m.deletedAt IS NULL')
    .orderBy('m.timestamp', 'DESC')
    .take(limit);

  if (before) {
    qb.andWhere('m.timestamp < :before', { before });
  }

  const rows = await qb.getMany();
  return rows.reverse(); // remettre en ordre chronologique
}
```

### Backend — Gateway `messages:get`

Accepter les paramètres de pagination :

```typescript
@SubscribeMessage('messages:get')
async handleGetMessages(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { chat_id: string; limit?: number; before?: string },
) {
  // ...
  const messages = await this.messageService.findBychat_id(
    payload.chat_id,
    payload.limit ?? 50,
    payload.before ? new Date(payload.before) : undefined,
  );
  client.emit('chat:event', {
    type: payload.before ? 'MESSAGE_LIST_PREPEND' : 'MESSAGE_LIST', // différencier chargement initial vs scroll
    payload: { chat_id: payload.chat_id, messages: messages.map(this.mapMessage) },
  });
}
```

### Frontend — Scroll infini (chargement des anciens messages)

Dans `chatStore.ts`, ajouter :

```typescript
loadMoreMessages: async (chat_id: string) => {
  const { messages, socket } = get();
  if (!socket || messages.length === 0) return;
  const oldest = messages[0]; // premier message affiché = le plus ancien
  socket.emit('messages:get', {
    chat_id,
    limit: 50,
    before: oldest.timestamp.toISOString(), // curseur
  });
},
```

Dans `ChatMessages.tsx`, ajouter un `IntersectionObserver` sur le premier message pour déclencher `loadMoreMessages` quand l'utilisateur remonte.

### Frontend — Gestion de `MESSAGE_LIST_PREPEND`

Dans `WebSocketEvents.tsx`, ajouter le case :

```typescript
case 'MESSAGE_LIST_PREPEND': {
  const older: Message[] = data.payload.messages.map(transformToMessage);
  chatState.prependMessages(data.payload.chat_id, older);
  break;
}
```

Dans `chatStore.ts` :

```typescript
prependMessages: (chat_id, older) => {
  set((state) => {
    if (state.selectedConversation?.chat_id !== chat_id) return state;
    return {
      messages: dedupeMessagesById([...older, ...state.messages]),
    };
  });
},
```

---

## Corrections P0-D : Supprimer le double filtrage frontend

**Fichier** : `front/src/app/whatsapp/page.tsx`

Centraliser tout le filtrage dans `page.tsx` et ne passer que le résultat final à `Sidebar` et `ConversationList`. Supprimer le filtrage redondant dans `Sidebar.tsx`.

```typescript
// Un seul endroit de filtrage dans page.tsx
const displayedConversations = useMemo(() => {
  return conversations.filter((conv) => {
    const matchesStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'unread' ? conv.unreadCount > 0 :
      filterStatus === 'nouveau' ? conv.status === 'nouveau' :
      filterStatus === 'urgent' ? conv.priority === 'haute' : true;

    const matchesSearch = !searchQuery
      ? true
      : conv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.clientPhone.includes(searchQuery) ||
        (conv.lastMessage?.text ?? '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });
}, [conversations, filterStatus, searchQuery]);
```

Utiliser `useMemo` pour éviter de refiltrer à chaque rendu React.

---

## Livrables P0

- [ ] `WhatsappMessageService` : `findLastMessagesBulk()` + `countUnreadMessagesBulk()`
- [ ] `sendConversationsToClient` : remplacé par bulk-fetch (2N+1 → 3 requêtes)
- [ ] `findByPosteId` : suppression de la relation `messages`
- [ ] `findBychat_id` : pagination avec curseur `before`
- [ ] Gateway `messages:get` : accept `limit` + `before`, émet `MESSAGE_LIST_PREPEND`
- [ ] Frontend store : `prependMessages` + `loadMoreMessages`
- [ ] Frontend `ChatMessages.tsx` : `IntersectionObserver` pour scroll infini
- [ ] Frontend `page.tsx` : filtrage centralisé avec `useMemo`

---

---

# PHASE 1 — Stats Snapshot + Cron (PRIORITÉ MAXIMALE)

## Objectif
Remplacer le calcul à la demande par une table de résultats pré-calculés.
L'utilisateur lit un snapshot stocké — 0 calcul en temps réel.

## Principe
```
Avant : Utilisateur ouvre la page → MySQL calcule sur 1M lignes → affiche (lent)
Après : Cron toutes les 10 min → calcule → stocke → Utilisateur lit 1 ligne (rapide)
```

## Entité à créer : `analytics_snapshot`

```typescript
// src/analytics/entities/analytics-snapshot.entity.ts
@Entity('analytics_snapshot')
export class AnalyticsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Clé de granularité
  @Column({ type: 'enum', enum: ['global', 'poste', 'commercial', 'channel'] })
  scope: 'global' | 'poste' | 'commercial' | 'channel';

  @Column({ type: 'varchar', length: 100, nullable: true })
  scope_id: string | null; // poste_id / commercial_id / channel_id selon le scope

  // Période couverte
  @Column({ type: 'date', nullable: true })
  date_start: Date | null; // null = toutes périodes confondues

  @Column({ type: 'date', nullable: true })
  date_end: Date | null;

  // Payload JSON — toutes les métriques calculées
  @Column({ type: 'json' })
  data: Record<string, unknown>;

  // Métadonnées
  @CreateDateColumn({ name: 'computed_at' })
  computed_at: Date;

  @Column({ name: 'ttl_seconds', type: 'int', default: 600 })
  ttl_seconds: number; // durée de validité en secondes
}
```

**Index à ajouter :**
```typescript
@Index('IDX_snapshot_scope_id_date', ['scope', 'scope_id', 'date_start'])
@Index('IDX_snapshot_computed_at', ['computed_at'])
```

## Service à créer : `AnalyticsSnapshotService`

### Méthodes requises

```typescript
// Calcule et stocke tous les snapshots
async computeAll(): Promise<void>

// Lit le dernier snapshot valide pour un scope donné
async getLatest(scope: string, scope_id?: string): Promise<AnalyticsSnapshot | null>

// Invalide les snapshots périmés
async purgeExpired(): Promise<void>
```

### Logique de `computeAll()`
1. Appeler `MetriquesService` pour chaque type de métrique
2. Stocker chaque résultat dans `analytics_snapshot`
3. Journaliser la durée d'exécution

## Cron à créer : `AnalyticsCronService`

```typescript
// Toutes les 10 minutes — recalcule les snapshots
@Cron('0 */10 * * * *')
async refreshSnapshots() { ... }

// Toutes les heures — purge les snapshots expirés
@Cron('0 0 * * * *')
async purgeSnapshots() { ... }
```

## Modifications du controller existant

`MetriquesController` doit lire depuis le snapshot au lieu de recalculer :

```typescript
// AVANT
async getMetriquesMessages() {
  return this.metriquesService.getMetriquesMessages(); // calcule en live
}

// APRÈS
async getMetriquesMessages() {
  const snap = await this.snapshotService.getLatest('global');
  if (snap) return snap.data.messages; // lecture rapide
  return this.metriquesService.getMetriquesMessages(); // fallback si snapshot absent
}
```

## Endpoint de forçage manuel

```
POST /api/metriques/refresh-snapshots   [AdminGuard]
```
Permet à l'admin de déclencher un recalcul immédiat sans attendre le cron.

## Modifications frontend (admin)

- Afficher la mention **"Données mises à jour il y a X min"** en bas de la vue analytique
- Ajouter un bouton **"Actualiser"** qui appelle `POST /api/metriques/refresh-snapshots`
- Si `computed_at` > 15 min → afficher une alerte orange "Données potentiellement obsolètes"

## Livrables P1

- [ ] Migration : table `analytics_snapshot`
- [ ] `AnalyticsSnapshotService` (compute + read + purge)
- [ ] `AnalyticsCronService` (2 crons)
- [ ] Modification `MetriquesController` (lecture snapshot en priorité)
- [ ] Endpoint `POST /refresh-snapshots`
- [ ] UI : indicateur "dernière mise à jour" + bouton actualiser

---

---

# PHASE 2 — Redis Cache Distribué

## Objectif
Remplacer le cache in-memory actuel (Map dans `MetriquesService`) par Redis.
Avantages : partagé entre plusieurs instances Node, persistant aux redémarrages, observable.

## Prérequis
- Redis 7.x installé et accessible
- Package `ioredis` ou `@nestjs/cache-manager` avec `cache-manager-ioredis`

## Configuration à ajouter

### Variables d'environnement (`.env`)
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TTL_METRIQUES=60       # secondes — métriques temps réel
REDIS_TTL_SNAPSHOTS=600      # secondes — snapshots analytiques
REDIS_TTL_STATS_POSTE=300    # secondes — stats par poste
```

### Module Redis (`RedisModule`)
```typescript
// src/redis/redis.module.ts
CacheModule.register({
  store: redisStore,
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT),
  ttl: 60,
})
```

## Refactoring : `MetriquesService`

Remplacer le cache in-memory :
```typescript
// AVANT (in-memory — perdu au redémarrage, non partagé)
private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();

// APRÈS (Redis — partagé, persistant)
constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

async getCached<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T> {
  const cached = await this.cacheManager.get<T>(key);
  if (cached !== undefined && cached !== null) return cached;
  const data = await compute();
  await this.cacheManager.set(key, data, ttl);
  return data;
}
```

## Refactoring : `WhatsappChatService`

Utiliser Redis pour les stats par poste (lues fréquemment, changent peu) :
```typescript
async getStatsByPoste(): Promise<PosteStats[]> {
  return this.getCached('stats:postes', 120, () => this._computeStatsByPoste());
}
```

## Stratégie d'invalidation

| Événement | Clés à invalider |
|---|---|
| Nouveau message reçu | `metriques:messages:*` |
| Chat changé de statut | `metriques:chats:*`, `stats:postes` |
| Commercial connecté/déconnecté | `metriques:commerciaux:*` |

Implémentation via des événements NestJS (`EventEmitter2`) :
```typescript
@OnEvent('message.created')
async onMessageCreated() {
  await this.cacheManager.del('metriques:messages:*');
}
```

## Monitoring Redis à ajouter

Endpoint admin pour observer l'état du cache :
```
GET /api/admin/cache-stats  [AdminGuard]
→ { hits: number, misses: number, keys: string[], memory_used: string }
```

## Livrables P2

- [ ] `RedisModule` configuré
- [ ] Variables d'environnement documentées
- [ ] Refactoring `MetriquesService` → cache Redis
- [ ] Refactoring `WhatsappChatService` → cache Redis pour stats
- [ ] Invalidation event-driven sur `message.created`, `chat.updated`
- [ ] Endpoint `/cache-stats`
- [ ] Tests : vérifier que le cache est bien hit/miss

---

---

# PHASE 3 — Interface commerciaux : Virtualisation + optimisations React

## Objectif
Garantir que l'interface commerciaux reste fluide même avec 500+ conversations et 2000+ messages dans une conversation ouverte. Les corrections P0 éliminent les bottlenecks SQL — cette phase s'attaque aux bottlenecks JavaScript/React.

## Problèmes ciblés

### 3-A : Rendu de toutes les conversations dans la sidebar (DOM oversized)

Actuellement, tous les `<ConversationItem>` sont rendus dans le DOM même si seulement 15 sont visibles. Avec 200 conversations = 200 composants montés, écouteurs d'événements inclus.

**Solution : Virtualisation avec `react-window`**

```bash
npm install react-window @types/react-window
```

```typescript
// ConversationList.tsx — APRÈS
import { FixedSizeList as List } from 'react-window';

export default function ConversationList({ filteredConversations, ... }) {
  return (
    <List
      height={window.innerHeight - 140} // hauteur visible de la sidebar
      itemCount={filteredConversations.length}
      itemSize={72}                     // hauteur d'un ConversationItem
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ConversationItem
            conversation={filteredConversations[index]}
            isSelected={selectedConversation?.id === filteredConversations[index].id}
            isTyping={!!typingStatus[filteredConversations[index].chat_id]}
            onClick={() => onSelectConversation(filteredConversations[index])}
          />
        </div>
      )}
    </List>
  );
}
```

**Résultat** : 200 composants DOM → **~15 composants DOM** (uniquement ceux visibles).

### 3-B : Re-rendu excessif du store Zustand

À chaque message entrant, `addMessage` met à jour `conversations` (tableau entier), ce qui déclenche un re-rendu de tous les `<ConversationItem>`, même ceux non concernés.

**Solution : Sélecteurs granulaires + `React.memo`**

```typescript
// ConversationItem.tsx — wrapper avec memo
export default React.memo(ConversationItem, (prev, next) => {
  return (
    prev.conversation.id === next.conversation.id &&
    prev.conversation.unreadCount === next.conversation.unreadCount &&
    prev.conversation.lastMessage?.id === next.conversation.lastMessage?.id &&
    prev.isSelected === next.isSelected &&
    prev.isTyping === next.isTyping
  );
});
```

```typescript
// Sélecteur granulaire dans le store — ne s'abonne qu'à la conversation ciblée
const conv = useChatStore(
  useCallback((s) => s.conversations.find((c) => c.chat_id === chat_id), [chat_id]),
  shallow,
);
```

### 3-C : Rendu de tous les messages dans `ChatMessages` (DOM oversized)

Une vieille conversation de 500 messages = 500 composants `<ChatMessage>` montés simultanément.

**Solution : Virtualisation avec `react-window` + scroll inversé**

```typescript
// ChatMessages.tsx — APRÈS
import { VariableSizeList as List } from 'react-window';

// VariableSizeList car les messages ont des hauteurs différentes (texte court vs long)
// Scroll ancré en bas (behavior habituel des chats)
```

Complexité : le scroll inversé ancré en bas nécessite une implémentation soigneuse. Utiliser la lib `react-virtuoso` qui gère nativement le scroll ancré en bas pour les chats.

```bash
npm install react-virtuoso
```

```typescript
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={messages}
  followOutput="smooth"          // ancre le scroll en bas automatiquement
  initialTopMostItemIndex={messages.length - 1}
  itemContent={(index, msg) => <ChatMessage key={msg.id} msg={msg} index={index} />}
  startReached={() => loadMoreMessages(currentConv.chat_id)} // scroll infini vers le haut
/>
```

### 3-D : Optimisation des re-renders `ChatMessage`

Envelopper `ChatMessage` dans `React.memo` pour éviter de re-rendre les messages déjà affichés quand un nouveau message arrive.

```typescript
export default React.memo(ChatMessage, (prev, next) => {
  return prev.msg.id === next.msg.id && prev.msg.status === next.msg.status;
  // Re-render uniquement si le statut change (sent → delivered → read)
});
```

### 3-E : Debounce de la recherche dans la sidebar

La recherche textuelle dans la sidebar se déclenche à chaque frappe et filtre toutes les conversations. Ajouter un debounce de 200ms.

```typescript
// useDebounce hook (à créer dans front/src/hooks/useDebounce.ts)
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Dans page.tsx
const debouncedSearch = useDebounce(searchQuery, 200);
// Utiliser debouncedSearch dans le useMemo de filtrage
```

## Livrables P3

- [ ] `react-virtuoso` installé
- [ ] `ConversationList.tsx` : virtualisation avec `react-window` (`FixedSizeList`)
- [ ] `ChatMessages.tsx` : virtualisation avec `react-virtuoso` + scroll infini vers le haut
- [ ] `ChatMessage.tsx` : `React.memo` avec comparateur de statut
- [ ] `ConversationItem.tsx` : `React.memo` avec comparateur granulaire
- [ ] `useDebounce.ts` : hook debounce 200ms pour la recherche
- [ ] Sélecteurs Zustand granulaires pour éviter les re-renders globaux

---

---

# PHASE 4 — Incremental Counters (Event-Driven)

## Objectif
Ne plus compter les lignes à la volée. Chaque action (message envoyé, chat créé) incrémente un compteur atomique.
Lecture instantanée des totaux — même avec 100M de lignes.

## Principe CQRS

```
Écriture  : Message sauvegardé → EventEmitter → incrémenter compteur Redis/DB
Lecture   : Vue analytique lit les compteurs → pas de COUNT(*) sur la table
```

## Nouvelle table : `realtime_counters`

```typescript
@Entity('realtime_counters')
export class RealtimeCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  counter_key: string; // ex: "messages:out:poste:abc123"

  @Column({ type: 'bigint', default: 0 })
  value: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
// Index UNIQUE sur counter_key
```

## Convention de nommage des clés

```
messages:in:total
messages:out:total
messages:in:poste:{poste_id}
messages:out:commercial:{commercial_id}
chats:actifs:total
chats:actifs:poste:{poste_id}
contacts:total
contacts:nouveaux:jour:{YYYY-MM-DD}
```

## Service : `CounterService`

```typescript
// Incrémente atomiquement (INSERT ... ON DUPLICATE KEY UPDATE value = value + 1)
async increment(key: string, by = 1): Promise<void>

// Décrémente (ex: chat fermé)
async decrement(key: string, by = 1): Promise<void>

// Lit une valeur
async get(key: string): Promise<number>

// Lit plusieurs valeurs en une fois
async getMany(keys: string[]): Promise<Map<string, number>>
```

## Points d'intégration

### Dans `WhatsappMessageService`
```typescript
// Après chaque message sauvegardé
await this.counterService.increment(`messages:${direction}:total`);
await this.counterService.increment(`messages:${direction}:poste:${poste_id}`);
if (commercial_id) {
  await this.counterService.increment(`messages:out:commercial:${commercial_id}`);
}
```

### Dans `WhatsappChatService`
```typescript
// À la création d'un chat
await this.counterService.increment('chats:actifs:total');
await this.counterService.increment(`chats:actifs:poste:${poste_id}`);

// À la fermeture d'un chat
await this.counterService.decrement('chats:actifs:total');
```

## Réconciliation périodique

Un cron toutes les 24h compare les compteurs avec un COUNT(*) réel et corrige les dérives :
```typescript
@Cron('0 3 * * *') // 3h du matin
async reconcileCounters(): Promise<void> { ... }
```

## Livrables P3

- [ ] Migration : table `realtime_counters`
- [ ] `CounterService` (increment / decrement / get / getMany)
- [ ] Intégration dans `WhatsappMessageService`
- [ ] Intégration dans `WhatsappChatService`
- [ ] Intégration dans `ContactService`
- [ ] Cron de réconciliation 24h
- [ ] `MetriquesController` lit les compteurs pour les totaux simples

---

---

# PHASE 4 — Base de données analytique dédiée (TimescaleDB / ClickHouse)

## Objectif
Pour les rapports historiques sur de très grands volumes (>10M lignes), utiliser une base spécialisée pour les time-series.

## Contexte / Déclencheur
Cette phase est pertinente quand :
- Les tables `whatsapp_message` dépassent ~5-10 millions de lignes
- Les rapports "sur 12 mois" prennent > 5s même avec les snapshots
- Le besoin de drill-down en temps réel (filtres dynamiques) est fort

## Option A : TimescaleDB (extension PostgreSQL)

**Avantages** : SQL standard, extension de Postgres, compatible TypeORM
**Inconvénient** : Nécessite de migrer de MySQL vers PostgreSQL

### Architecture cible
```
MySQL (source de vérité)
    ↓ réplication via CDC (Debezium ou cron ETL)
TimescaleDB (analytics)
    ↑ lu uniquement par MetriquesService
```

### Hypertable principale
```sql
CREATE TABLE messages_timeseries (
  time        TIMESTAMPTZ NOT NULL,
  poste_id    UUID,
  commercial_id UUID,
  direction   VARCHAR(3),
  type        VARCHAR(20),
  status      VARCHAR(20)
);
SELECT create_hypertable('messages_timeseries', 'time');
```

**Requête analytique** (vitesse x50 vs MySQL) :
```sql
SELECT time_bucket('1 day', time) AS day,
       poste_id,
       COUNT(*) FILTER (WHERE direction = 'IN') AS messages_in,
       COUNT(*) FILTER (WHERE direction = 'OUT') AS messages_out
FROM messages_timeseries
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY day, poste_id
ORDER BY day;
```

## Option B : ClickHouse (recommandé pour >50M lignes)

**Avantages** : vitesse x100-1000 vs MySQL pour les agrégats, compression exceptionnelle
**Inconvénient** : Pas de TypeORM natif, requêtes HTTP ou driver dédié

### Architecture cible
```
MySQL → ETL (cron 5 min) → ClickHouse
                                ↑
                    MetriquesService (requêtes analytics)
```

### Table ClickHouse
```sql
CREATE TABLE messages_analytics (
  event_date   Date,
  event_time   DateTime,
  poste_id     String,
  commercial_id String,
  direction    Enum8('IN'=1, 'OUT'=2),
  type         LowCardinality(String),
  status       LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, poste_id, direction);
```

## ETL (Extract-Transform-Load)

Quel que soit le moteur choisi, un service ETL synchronise MySQL → analytics DB :

```typescript
// src/etl/etl.service.ts
@Cron('*/5 * * * *') // toutes les 5 minutes
async syncToAnalyticsDb(): Promise<void> {
  const lastSync = await this.getLastSyncTimestamp();
  const newMessages = await this.messageRepo.find({
    where: { createdAt: MoreThan(lastSync) }
  });
  await this.analyticsDb.bulkInsert(newMessages);
  await this.saveLastSyncTimestamp(new Date());
}
```

## Critères de choix

| Critère | Rester sur MySQL+snapshots | TimescaleDB | ClickHouse |
|---|---|---|---|
| Volume < 5M lignes | ✅ Suffisant | Surdimensionné | Surdimensionné |
| Volume 5-50M lignes | ⚠️ Avec snapshots | ✅ Idéal | Possible |
| Volume > 50M lignes | ❌ Insuffisant | ⚠️ Limite | ✅ Idéal |
| Drill-down dynamique | ❌ | ✅ | ✅ |
| Complexité d'infra | Faible | Moyenne | Élevée |

## Livrables P4

- [ ] Choix du moteur (TimescaleDB vs ClickHouse) selon volume réel
- [ ] Provisioning Docker (service ajouté au `docker-compose.yml`)
- [ ] Service ETL avec cron 5 min + gestion du dernier timestamp sync
- [ ] Migration du `MetriquesService` vers le nouveau moteur pour les requêtes historiques
- [ ] Dashboard de monitoring ETL (lag, erreurs, volume synchronisé)
- [ ] Stratégie de fallback : si analytics DB indisponible → MySQL

---

---

# Synthèse de l'implémentation

## Roadmap recommandée

```
Jour 1 :     P0 — Élimination N+1 gateway + pagination messages
             → Gain immédiat sur le chargement commercial, 0 risque

Semaine 1 :  P1 — Snapshot + Cron (analytics admin)
             → Gain immédiat, risque faible, déployable rapidement

Semaine 2-3: P2 — Redis cache distribué (les deux surfaces)
             → Améliore la réactivité, prépare P4

Semaine 3 :  P3 — Virtualisation React (interface commerciaux)
             → Fluidité UI avec grand volume de messages/conversations

Semaine 4:   P4 — Counters event-driven
             → Élimine les COUNT(*) sur les métriques temps réel

Mois 2-3:    P5 — Analytics DB dédiée
             → À déclencher quand le volume le justifie vraiment
```

## Gains attendus par phase

| Phase | Surface | Situation actuelle | Après |
|---|---|---|---|
| P0 — N+1 gateway | Interface commerciaux | 2N+1 requêtes SQL au chargement (100 req pour 50 convs) | **3 requêtes** |
| P0 — Pagination messages | Interface commerciaux | Tous les messages chargés (2000+) | **50 messages** puis scroll infini |
| P0 — Virtualisation store | Interface commerciaux | Re-rendu de toutes les convs à chaque message | Re-rendu **1 composant** |
| P1 — Snapshot | Analytics admin | 3-8s (calcul live) | **< 100ms** |
| P2 — Redis | Les deux | 500ms-1s (cache miss systématique) | **< 50ms** (cache hit) |
| P3 — Virtualisation React | Interface commerciaux | 200-500 composants DOM | **~15 composants** visibles |
| P4 — Counters | Analytics admin | 200-500ms (COUNT live) | **< 10ms** |
| P5 — Analytics DB | Analytics admin | 5-30s (rapports longs) | **< 500ms** |

## Architecture cible finale

```
┌──────────────────────────────────────────────────────────┐
│                  Interface Commerciaux                    │
│  react-virtuoso (messages) + react-window (convs)        │
│  Zustand sélecteurs granulaires + React.memo             │
└────────────────────────┬─────────────────────────────────┘
                         │ WebSocket (Socket.IO)
┌────────────────────────▼─────────────────────────────────┐
│               Gateway (NestJS WebSocket)                  │
│  sendConversationsToClient → 3 requêtes bulk             │
│  messages:get → pagination 50 messages + curseur         │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                     MySQL (source de vérité)              │
│  + Index de performance (29 index — déjà en place)       │
└────────┬──────────────────────────┬───────────────────────┘
         │                          │
┌────────▼──────┐          ┌────────▼──────────────────────┐
│     Redis     │          │    Table analytics_snapshot    │
│  Cache TTL    │          │    (pré-calculé toutes 10min)  │
│  (P2)         │          │    (P1)                        │
└───────────────┘          └───────────────────────────────┘
                                    ↑
                           ┌────────┴──────┐
                           │  Analytics DB  │  (P5 — optionnel)
                           │  ClickHouse    │
                           └───────────────┘

┌──────────────────────────────────────────────────────────┐
│                   Admin Panel                             │
│  Lit analytics_snapshot → 0 calcul en temps réel        │
│  Bouton "Actualiser" → force recalcul cron               │
└──────────────────────────────────────────────────────────┘
```

---

*Document généré le 2026-03-31 — à réviser après implémentation de chaque phase*
