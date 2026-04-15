# Plan — Isolation des conversations par canal dédié

---

## Source de vérité : champs déjà présents dans le système

Avant d'ajouter quoi que ce soit, voici ce qui existe déjà et suffit à tout piloter.

### Sur `WhatsappMessage`
| Champ | Type | Rôle |
|-------|------|------|
| `channel_id` | VARCHAR NOT NULL | Canal exact par lequel le message est arrivé (ou a été envoyé) |
| `dedicated_channel_id` | VARCHAR NULLABLE | Renseigné si le canal est dédié à un poste, NULL sinon |
| `chat_id` | VARCHAR NOT NULL | Identifiant du client (numéro WA, user ID Meta…) |

### Sur `WhapiChannel`
| Champ | Type | Rôle |
|-------|------|------|
| `poste_id` | VARCHAR NULLABLE | Non-null = canal dédié exclusivement à ce poste |

### Sur `WhatsappChat` (conversation)
| Champ | Type | Rôle actuel | Rôle après ce plan |
|-------|------|-------------|---------------------|
| `channel_id` | VARCHAR NULLABLE | Canal lié à la conv (mal utilisé) | **Discriminateur de scope** : NULL = pool, valeur = canal dédié |
| `id` | UUID | Clé primaire | Clé de verrouillage des messages auto (remplace `chat_id`) |

> Aucune nouvelle colonne n'est nécessaire. Tout repose sur `message.channel_id`,
> `message.dedicated_channel_id` et `conversation.channel_id` — des champs déjà en place.

---

## Problème

Quand un client ayant une conversation pool écrit sur un canal dédié,
`assignConversationInternal` cherche par `chat_id` seul :

```ts
findOne({ where: { chat_id: clientPhone } })
// → retourne la conversation pool existante
// → le poste dédié voit les anciens messages pool
// → auto_message_step déjà > 0 → messages auto du canal dédié jamais envoyés
```

De plus, `chatService.update(chat_id, ...)` écrase les compteurs
de **toutes** les conversations du client en même temps :

```
Pool → auto_message_step = 3
Dédié → créé, step = 0 → orchestrateur envoie step 1
  → update(chat_id, { auto_message_step: 1 })
  → ⚠️ pool.auto_message_step passe aussi à 1   ← corruption
Client reécrit pool → reprend à step 2 au lieu de 4
Client écrit autre canal dédié → step 0 → step 1 → pool repasse à 1
                                                    ← boucle infinie de corruption
```

---

## Règles métier

| Cas | Comportement attendu |
|-----|----------------------|
| Client écrit canal dédié A | Conversation **propre à A**, jamais fusionnée |
| Client écrit canal dédié B ensuite | Conversation **propre à B**, séparée de A et du pool |
| Client écrit deux canaux normaux | Comportement inchangé — conversation pool unifiée |
| Poste dédié | Ne voit QUE les conversations de son canal (`channel_id = son_canal`) |
| Poste pool | Ne voit JAMAIS les conversations dédiées (`channel_id IS NULL`) |
| Premier message canal dédié | Nouvelle ligne BDD → compteurs à zéro → messages auto déclenchés naturellement |
| Client actif simultanément pool + dédié | Deux conversations parallèles indépendantes, aucune interférence |

### Précision : "premier message canal dédié"

Le client existe dans le système (conversation pool active avec `auto_message_step = 3`).
Le dispatcher crée une **nouvelle ligne** `whatsapp_chats` avec `channel_id = dedicatedChannelId`.
Cette nouvelle ligne a ses propres compteurs, tous à zéro.
L'orchestrateur voit une conversation vierge → déclenche les messages auto naturellement.
La conversation pool garde `auto_message_step = 3` **intouchée**.

Cela fonctionne seulement si toutes les mises à jour utilisent l'UUID et non le `chat_id`.

---

## Mécanisme de scope : `whatsapp_chats.channel_id`

| `channel_id` sur la conversation | Signification |
|----------------------------------|---------------|
| `NULL` | Conversation pool — tous les canaux normaux partagent cette entrée |
| `'chan_recrutement_id'` | Conversation dédiée au canal recrutement |
| `'chan_reclamations_id'` | Conversation dédiée au canal réclamations |

Le `channel_id` de la conversation indique **quel canal en est propriétaire**.
Le lookup utilise `(chat_id, channel_id)` comme clé composite.

---

## Flux d'un message entrant (après plan)

```
Webhook arrive → InboundMessageService
       ↓
message.channelId connu
       ↓
Dispatcher: getDedicatedPosteId(channelId)
       ↓
   ┌── dédié ? ─────────────────────────────────────────┐
   │ OUI                                                 │ NON
   ↓                                                     ↓
findOne({                                        findOne({
  chat_id: phone,                                  chat_id: phone,
  channel_id: channelId  ← exact match            channel_id: IsNull()  ← pool
})                                               })
   ↓                                                     ↓
 trouvé → continuer                             trouvé → continuer
 non trouvé → créer avec channel_id=channelId   non trouvé → créer avec channel_id=null
```

---

## Deux conversations parallèles — garantie d'isolation

```
Base de données après le plan :

id (UUID) | chat_id        | channel_id          | poste_id     | auto_message_step
──────────┼────────────────┼─────────────────────┼──────────────┼──────────────────
uuid-A    | 336…@s.wa.net  | NULL                | poste_pool   | 3
uuid-B    | 336…@s.wa.net  | chan_recrutement_id  | poste_dedie  | 1

Message arrivant sur canal "produits" (normal)
→ scopeKey = NULL → findOne(chat_id=336, channel_id=NULL) → uuid-A
→ auto_message update cible uuid-A uniquement

Message arrivant sur canal "recrutement" (dédié)
→ scopeKey = chan_recrutement_id → findOne(chat_id=336, channel_id=chan_recrutement_id) → uuid-B
→ auto_message update cible uuid-B uniquement
```

---

## Fichiers à modifier

### 1. Migration `src/database/migrations/20260415_add_scope_channel_id_to_chat.ts`

Deux opérations :

**a) Normaliser les `channel_id` existants sur les conversations**

Les conversations pool ont souvent `channel_id` renseigné (canal du premier message).
Pour que le lookup `channel_id IS NULL` fonctionne correctement, il faut remettre
à NULL les `channel_id` qui pointent vers des canaux non-dédiés.

```sql
-- Conversations liées à un canal NON dédié → channel_id = NULL (pool)
UPDATE whatsapp_chats c
INNER JOIN whapi_channels ch ON ch.channel_id = c.channel_id
SET c.channel_id = NULL
WHERE ch.poste_id IS NULL;
-- Les conversations liées à un canal dédié conservent leur channel_id.
```

**b) Remplacer la contrainte unique**

```ts
export class NormalizeConvChannelScope1776297600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Normaliser les channel_id existants (pool → NULL)
    await queryRunner.query(`
      UPDATE whatsapp_chats c
      INNER JOIN whapi_channels ch ON ch.channel_id = c.channel_id
      SET c.channel_id = NULL
      WHERE ch.poste_id IS NULL
    `);

    // Supprimer l'ancien index unique
    await queryRunner.query(`
      ALTER TABLE whatsapp_chats DROP INDEX UQ_whatsapp_chat_tenant_chat_id
    `);

    // Nouvel index : (tenant_id, chat_id, channel_id)
    // - channel_id non-null (dédié) → unicité garantie par BDD
    // - channel_id null (pool)      → MySQL autorise plusieurs NULL
    //                                  unicité garantie par le mutex InboundMessageService
    await queryRunner.query(`
      ALTER TABLE whatsapp_chats
        ADD UNIQUE INDEX UQ_whatsapp_chat_channel (tenant_id, chat_id, channel_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE whatsapp_chats DROP INDEX UQ_whatsapp_chat_channel`);
    await queryRunner.query(`
      ALTER TABLE whatsapp_chats
        ADD UNIQUE INDEX UQ_whatsapp_chat_tenant_chat_id (tenant_id, chat_id)
    `);
  }
}
```

> La contrainte `channel_id IS NULL` (pool) est protégée par le mutex déjà présent dans
> `InboundMessageService.getChatMutex(chatId)` — un seul webhook par `chat_id` à la fois.

---

### 2. `src/dispatcher/dispatcher.service.ts` — `assignConversationInternal`

```ts
private async assignConversationInternal(
  clientPhone: string,
  clientName: string,
  traceId?: string,
  tenantId?: string,
  channelId?: string,
): Promise<WhatsappChat | null> {

  // ① Déterminer le scope à partir du channelId du message entrant
  const dedicatedPosteId = channelId
    ? await this.channelService.getDedicatedPosteId(channelId)
    : null;

  // ② Lookup scope-aware
  //    canal dédié  → (chat_id, channel_id = channelId)
  //    canal normal → (chat_id, channel_id IS NULL)
  const conversation = dedicatedPosteId && channelId
    ? await this.chatRepository.findOne({
        where: { chat_id: clientPhone, channel_id: channelId },
        relations: ['messages', 'poste', 'channel'],
      })
    : await this.chatRepository.findOne({
        where: { chat_id: clientPhone, channel_id: IsNull() },
        relations: ['messages', 'poste', 'channel'],
      });

  // ... logique des cas 1 / 2 / 3 inchangée ...

  // ③ Cas 4 — création : fixer le channel_id selon le scope
  const newChat = this.chatRepository.create({
    // ... champs existants ...
    channel_id: dedicatedPosteId ? channelId : null,  // ← seul ajout
  });
```

> `channel_id` est **immuable** après création — jamais modifié dans les cas 1/2/3.

---

### 3. `src/whatsapp_chat/whatsapp_chat.service.ts` — nouveaux outils UUID

#### 3a. `findById` — lookup par UUID

```ts
async findById(id: string): Promise<WhatsappChat | null> {
  const chat = await this.chatRepository
    .createQueryBuilder('chat')
    .leftJoinAndSelect('chat.poste', 'poste')
    .leftJoinAndSelect('chat.channel', 'channel')
    .where('chat.id = :id', { id })
    .getOne();
  return chat ?? null;
}
```

#### 3b. `updateById` — update ciblé sur un UUID

Même réinitialisations de cycles que `update()` mais ne touche **qu'une seule conversation**.

```ts
async updateById(id: string, data: Partial<WhatsappChat>): Promise<void> {
  if (data.last_poste_message_at !== undefined) {
    data.no_response_auto_step = 0;
    data.last_no_response_auto_sent_at = null;
  }
  if (data.poste_id !== undefined && data.poste_id !== null) {
    data.queue_wait_auto_step = 0;
    data.last_queue_wait_auto_sent_at = null;
    data.on_assign_auto_sent = false;
  }
  if (data.last_activity_at !== undefined) {
    data.inactivity_auto_step = 0;
    data.last_inactivity_auto_sent_at = null;
  }
  await this.chatRepository.update({ id }, data);
}
```

---

### 4. Migration de tous les `update(chat_id, ...)` → `updateById(uuid, ...)`

Chaque appelant possède déjà l'objet `WhatsappChat` avec son UUID.

| Fichier | Ligne | Champ corrompu sans fix | Fix |
|---------|-------|-------------------------|-----|
| `webhooks/inbound-message.service.ts` | 174 | `last_client_message_at`, `auto_message_step`, `read_only` | `updateById(conversation.id, ...)` |
| `message-auto/message-auto.service.ts` | 273 | tous les tracking auto | `updateById(chat.id, ...)` dans `updateTriggerTracking` |
| `message-auto/message-auto.service.ts` | 330 | `auto_message_status` | `updateById(chat.id, ...)` dans `sendAutoMessage` |
| `message-auto/message-auto.service.ts` | 354 | `read_only`, `auto_message_status` | idem |
| `message-auto/message-auto.service.ts` | 364 | `read_only`, `auto_message_status` | idem |
| `message-auto/auto-message-orchestrator.ts` | 147, 160, 205, 226, 278 | `read_only` | `updateById(chat.id, ...)` |
| `message-auto/auto-message-orchestrator.ts` | 302 | `auto_message_step`, `waiting_client_reply`, `last_auto_message_sent_at` | `updateById(chatUuid, ...)` |
| `whatsapp_message/whatsapp_message.gateway.ts` | 586 | `status` | `updateById(chat.id, ...)` |

**Règle** : si tu as le `chat` ou `conversation` objet → utilise `chat.id`.

---

### 5. `src/message-auto/auto-message-orchestrator.service.ts` — lock par UUID

```ts
async handleClientMessage(chat: WhatsappChat): Promise<void> {
  const lockKey = chat.id;  // UUID — unique par conversation, pas par client

  if (this.locks.has(lockKey)) { return; }
  this.locks.add(lockKey);

  // Verrouiller CETTE conversation uniquement
  await this.chatService.updateById(chat.id, { read_only: true });

  const timeout = setTimeout(() => {
    void this.executeAutoMessage(chat.id)
      .catch(async () => {
        await this.chatService.updateById(chat.id, { read_only: false }).catch(() => {});
      })
      .finally(() => {
        this.locks.delete(lockKey);
        this.pendingTimeouts.delete(lockKey);
      });
  }, delayMs);

  this.pendingTimeouts.set(lockKey, timeout);
}

private async executeAutoMessage(chatUuid: string): Promise<void> {
  const freshChat = await this.chatService.findById(chatUuid); // par UUID, sans ambiguïté
  if (!freshChat) return;

  // ... vérifications inchangées ...

  await this.messageAutoService.sendAutoMessage(chatUuid, nextStep); // UUID en arg
  await this.chatService.updateById(chatUuid, {
    auto_message_step: nextStep,
    waiting_client_reply: true,
    last_auto_message_sent_at: new Date(),
  });
}
```

---

### 6. `src/message-auto/message-auto.service.ts` — sendAutoMessage par UUID

```ts
// Signature avant : sendAutoMessage(chatId: string, position: number)
//   → chatId = chat.chat_id (numéro de téléphone) → findBychat_id ambigu

// Signature après :
async sendAutoMessage(chatUuid: string, position: number): Promise<void> {
  const chat = await this.chatService.findById(chatUuid);  // UUID → conversation exacte
  if (!chat) return;

  // ...
  await this.chatService.updateById(chatUuid, { auto_message_status: 'sending' });
  // ...
  await this.chatService.updateById(chatUuid, { read_only: true, auto_message_status: 'sent' });
  // ...
  // en cas d'erreur :
  await this.chatService.updateById(chatUuid, { read_only: false, auto_message_status: 'failed' });
}
```

Idem pour `updateTriggerTracking` et `sendAutoMessageForTrigger` :
chaque méthode reçoit le `chat` objet → extraire `chat.id` → passer à `updateById`.

---

### 7. `src/whatsapp_message/whatsapp_message.gateway.ts` — `sendConversationsToClientInternal`

Le filtre par `poste_id` suffit déjà à l'isolation car :
- Le dispatcher assigne les convs dédiées (`channel_id = chan`) uniquement au poste dédié
- Le dispatcher assigne les convs pool (`channel_id = NULL`) uniquement aux postes pool

En sécurité additionnelle, passer le `channel_id` attendu à `findByPosteId` :

```ts
const dedicatedChannelIds = await this.channelService.getDedicatedChannelIdsForPoste(agent.posteId);
const isDedicated = dedicatedChannelIds.length > 0;

// Pour un poste dédié : ne charger que les convs de son canal
// Pour un poste pool  : ne charger que les convs sans scope dédié (channel_id IS NULL)
const channelIdFilter = isDedicated ? dedicatedChannelIds[0] : null; // null = IS NULL en SQL

let { chats, hasMore } = await this.chatService.findByPosteId(
  agent.posteId,
  [],
  isDedicated ? 10_000 : 300,
  isDedicated ? undefined : cursor,
  channelIdFilter,   // ← nouveau paramètre (undefined = pas de filtre supplémentaire)
);
```

Dans `findByPosteId`, si `channelIdFilter === null` → `WHERE channel_id IS NULL`,
si `channelIdFilter === 'chan_id'` → `WHERE channel_id = 'chan_id'`,
si `channelIdFilter === undefined` → pas de filtre (comportement existant).

---

## Ordre d'implémentation recommandé

```
1. whatsapp_chat.service.ts (findById + updateById)   ← outils UUID d'abord
2. Migration BDD                                       ← normaliser channel_id + nouvelle contrainte
3. dispatcher.service.ts                               ← lookup scope-aware (cœur du fix)
4. webhooks/inbound-message.service.ts                ← update → updateById
5. message-auto/message-auto.service.ts               ← sendAutoMessage + updateTriggerTracking par UUID
6. message-auto/auto-message-orchestrator.ts           ← lock par UUID + tous les update → updateById
7. whatsapp_message/gateway.ts                        ← update → updateById + channelIdFilter
```

---

## Points de vigilance

| Point | Détail |
|-------|--------|
| **FK `channel_id`** | `whatsapp_chats.channel_id` a une FK vers `whapi_channels` avec `ON DELETE SET NULL`. Si le canal dédié est supprimé, la conversation pool devient `channel_id = NULL` → devient conversation pool. Comportement acceptable. |
| **Pool conversations existantes** | La migration UPDATE remet `channel_id = NULL` pour toutes les convs dont le canal n'est pas dédié. Les convs sur canaux dédiés existants gardent leur `channel_id`. |
| **Mutex `getChatMutex(chatId)`** | Dans `InboundMessageService`, le mutex est sur `chatId` (numéro de téléphone), pas sur `(chatId, channelId)`. Pour des messages simultanés sur deux canaux différents du même client, les deux traitements s'exécutent séquentiellement. C'est conservateur mais correct — aucun risque de créer deux conversations pool. |
| **Poste dédié avec N canaux** | `getDedicatedChannelIdsForPoste` retourne une liste. Le dispatcher doit chercher parmi tous ses canaux. `findByPosteId` doit accepter `IN (:...channelIds)`. |
| **`lockConversation(id)` et `unlockConversation(id)`** | Ces méthodes appellent `update(id, ...)` où `id` est en réalité le `chat_id` (pas l'UUID). À renommer ou migrer vers `updateById`. |
| **`reinjectConversation`** | Utilise `chat.channel_id` pour détecter le canal dédié — déjà correct après ce plan (les convs dédiées ont `channel_id = canal_dédié`). |
