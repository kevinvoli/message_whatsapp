# Audit : Bug Timestamp – Conversation marquée comme lue

**Date :** 18/02/2026
**Branche :** `inification`
**Symptôme rapporté :** Après que le commercial clique sur une conversation (marquage comme lue), l'heure du dernier message affichée dans la sidebar change pour afficher l'heure exacte du clic, au lieu de l'heure réelle du message. La base de données est également affectée.

---

## 1. Résumé exécutif

Le bug est causé par la combinaison de **trois problèmes distincts** qui s'enchaînent :

1. `markChatAsRead` utilise `chatRepository.update()` → TypeORM déclenche automatiquement `@UpdateDateColumn` → **`whatsapp_chat.updatedAt` est mis à `NOW()` (heure du clic)**.
2. `findBychat_id` (service message) **marque tous les messages entrants comme `READ`** au moment du fetch → TypeORM déclenche `@UpdateDateColumn` → **`whatsapp_message.updatedAt = NOW()` sur tous les messages**.
3. La liste des conversations est **triée par `updatedAt DESC`** → la conversation "lue" remonte en tête de liste comme si un nouveau message avait été reçu.

Les champs `timestamp` des messages eux-mêmes **ne sont pas modifiés dans la base**, mais le champ `updatedAt` (utilisé pour le tri et envoyé au frontend) est corrompu avec l'heure du clic.

---

## 2. Flux complet – Séquence "le commercial clique sur une conversation"

```
Utilisateur clique sur ConversationItem
    │
    ▼
[FRONTEND] selectConversation(chat_id)              chatStore.ts:100-123
    │   ├── set unreadCount = 0 localement
    │   ├── socket.emit("messages:get", { chat_id })
    │   └── socket.emit("messages:read", { chat_id })
    │
    ├─────────── EVENT 1 : messages:get ───────────────────────────────────
    │   ▼
    │  [BACKEND] handleGetMessages()                 gateway.ts:454-474
    │   │   └── messageService.findBychat_id(chat_id)
    │   │            │
    │   │            ▼
    │   │       [BUG #2] UPDATE whatsapp_message    service.ts:484-493
    │   │           SET status = 'READ'
    │   │           WHERE chat_id = ? AND direction = 'IN' AND status != 'READ'
    │   │           ↳ @UpdateDateColumn déclenche :
    │   │             whatsapp_message.updatedAt = NOW()  ← HEURE DU CLIC
    │   │
    │   │       Puis retourne tous les messages (order: createdAt ASC)
    │   │
    │   ▼
    │  [BACKEND → FRONTEND] chat:event { type: 'MESSAGE_LIST', messages }
    │  [FRONTEND] setMessages() → transformToMessage() pour chaque message
    │       timestamp: new Date(raw.timestamp || raw.createdAt || Date.now())
    │       ↳ Si raw.timestamp est null/falsy → [BUG #4] Date.now() = heure du clic
    │
    ├─────────── EVENT 2 : messages:read ──────────────────────────────────
    │   ▼
    │  [BACKEND] handleMarkAsRead()                  gateway.ts:477-506
    │   │
    │   │   ├── chatService.markChatAsRead(chat_id)
    │   │   │       └── chatRepository.update({chat_id}, {unread_count: 0})
    │   │   │           ↳ [BUG #1] @UpdateDateColumn déclenche :
    │   │   │             whatsapp_chat.updatedAt = NOW()  ← HEURE DU CLIC
    │   │   │             (MySQL ON UPDATE CURRENT_TIMESTAMP)
    │   │   │
    │   │   ├── chatService.findBychat_id(chat_id)
    │   │   │       → chat.updatedAt = NOW() (heure du clic)
    │   │   │       → chat.last_activity_at = heure du dernier message client (inchangée)
    │   │   │
    │   │   ├── messageService.findLastMessageBychat_id(chat_id)
    │   │   │       ORDER BY timestamp DESC
    │   │   │       → lastMessage.timestamp = heure réelle du message (inchangée)
    │   │   │
    │   │   └── server.emit('chat:event', {
    │   │           type: 'CONVERSATION_UPSERT',
    │   │           payload: mapConversation(chat, lastMessage, 0)
    │   │       })
    │   │       Payload envoyé :
    │   │         - updatedAt       : NOW()  ← HEURE DU CLIC  [CORROMPU]
    │   │         - last_activity_at: heure dernier message client [CORRECT]
    │   │         - last_message.timestamp: lastMessage.timestamp [CORRECT]*
    │   │
    │   ▼
    │  [FRONTEND] handleChatEvent → case 'CONVERSATION_UPSERT'
    │       transformToConversation(data.payload)
    │         - updatedAt     = new Date(raw.updatedAt)  ← NOW()  [CORROMPU]
    │         - last_activity_at = new Date(raw.last_activity_at)  [CORRECT]
    │         - lastMessage = resolveLastMessage(raw.last_message)
    │                           → transformToMessage(raw.last_message)
    │                           → timestamp: new Date(raw.timestamp || raw.createdAt || Date.now())
    │                           ↳ Si timestamp null → [BUG #4] Date.now()
    │
    │       updateConversation(conversation)
    │         → REMPLACE ENTIÈREMENT la conversation dans le state
    │         → conversation.updatedAt = heure du clic  [CORROMPU]
    │         → conversation.lastMessage.timestamp = heure réelle OU Date.now() [POTENTIEL]
    │
    ▼
[FRONTEND] ConversationItem re-render                ConversationItem.tsx:109-111
    formatConversationTime(conversation.lastMessage.timestamp)
    ↳ Devrait afficher l'heure réelle
    ↳ MAIS si lastMessage.timestamp = null → affiche heure du clic (Date.now())
```

---

## 3. Bugs identifiés

### Bug #1 (CONFIRMÉ) – `updatedAt` du chat corrompu lors du marquage comme lu

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts:89-99`

```typescript
async markChatAsRead(chat_id: string): Promise<void> {
  await this.chatRepository.update(
    { chat_id: chat_id },
    {
      unread_count: 0,   // ← seul champ voulu
    },
  );
  // ⚠️ TypeORM @UpdateDateColumn déclenche automatiquement :
  // UPDATE whatsapp_chat SET unread_count=0, updatedAt=NOW() WHERE chat_id=?
  // ↳ updatedAt = heure du clic, pas heure du dernier message !
}
```

**Mécanisme :** `@UpdateDateColumn` sur l'entité `WhatsappChat` (avec `onUpdate: 'CURRENT_TIMESTAMP'`) déclenche une mise à jour automatique de `updatedAt` à chaque appel de `repository.update()`, même si `updatedAt` n'est pas dans la liste des champs à mettre à jour.

**Impact DB :** `whatsapp_chat.updatedAt` = heure du clic au lieu de l'heure du dernier message reçu.

**Fichier entité :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts:242-249`
```typescript
@UpdateDateColumn({
  name: 'updatedAt',
  type: 'timestamp',
  default: () => 'CURRENT_TIMESTAMP',
  onUpdate: 'CURRENT_TIMESTAMP',  // ← déclenchement automatique MySQL
})
updatedAt: Date;
```

---

### Bug #2 (CONFIRMÉ) – `findBychat_id` (service message) marque les messages comme lus et corrompt leur `updatedAt`

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts:483-493`

```typescript
async findBychat_id(chat_id: string, limit = 100, offset = 0) {
  // ⚠️ Cette méthode de LECTURE marque aussi les messages comme READ
  await this.messageRepository
    .createQueryBuilder()
    .update(WhatsappMessage)
    .set({ status: WhatsappMessageStatus.READ })
    .where('chat_id = :chat_id', { chat_id })
    .andWhere('direction = :direction', { direction: MessageDirection.IN })
    .andWhere('status != :status', { status: WhatsappMessageStatus.READ })
    .execute();
  // ↳ @UpdateDateColumn sur WhatsappMessage déclenche :
  //   whatsapp_message.updatedAt = NOW() sur TOUS les messages entrants non lus
}
```

**Problèmes :**
1. **Violation de responsabilité unique** : une méthode de lecture (`findBychat_id`) fait aussi une écriture (UPDATE).
2. **`whatsapp_message.updatedAt` est corrompu** : tous les messages entrants passent à `updatedAt = NOW()` (heure du clic).
3. **Appelée à chaque `messages:get`** : chaque ouverture de conversation corrompt les timestamps `updatedAt` des messages.

---

### Bug #3 (CONFIRMÉ) – Tri de la liste par `updatedAt` → réordonnancement erroné

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts:26-30`
```typescript
async findByPosteId(poste_id: string) {
  return this.chatRepository.find({
    order: { updatedAt: 'DESC' },  // ← tri par updatedAt
    ...
  });
}
```

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts:178`
```typescript
.orderBy('chat.updatedAt', 'DESC')  // ← dans findAll()
```

**Impact :** Après marquage comme lu, `updatedAt = heure_du_clic`. Lors du prochain chargement de la liste des conversations, la conversation "lue" remonte en tête de liste, comme si elle avait reçu un nouveau message. La liste n'est pas triée par heure du dernier message réel.

---

### Bug #4 (RISQUE) – Fallback dangereux sur `Date.now()` si timestamp null

**Fichier :** `front/src/types/chat.ts:544`
```typescript
export const transformToMessage = (raw: RawMessageData): Message => {
  return {
    ...
    timestamp: new Date(raw.timestamp || raw.createdAt || Date.now()),
    //                                                    ↑ FALLBACK DANGEREUX
    // Si raw.timestamp est null/undefined/0/false → Date.now() = heure courante
  };
};
```

**Fichier :** `front/src/components/chat/ChatMessage.tsx:56`
```typescript
const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
//                                                                   ↑ FALLBACK DANGEREUX
// Si msg.timestamp est falsy → new Date() = heure courante
```

**Impact :** Si `lastMessage.timestamp` est `null` dans la DB (données historiques, ou bug d'insertion), le timestamp affiché dans ConversationItem ET dans le chat sera l'heure actuelle au moment de la réception de l'événement socket, pas l'heure réelle du message.

---

### Bug #5 (MINEUR) – Tri des messages par `createdAt` au lieu de `timestamp`

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts:499`
```typescript
const mess = await this.messageRepository.find({
  order: { createdAt: 'ASC' },  // ← createdAt = heure d'insertion en DB
  // Devrait être : { timestamp: 'ASC' }  ← heure réelle WhatsApp
  ...
});
```

**Impact :** Les messages apparaissent triés par heure d'insertion en base, pas par heure d'envoi WhatsApp. Pour les messages retardés ou rétro-importés, l'ordre peut être incorrect.

---

## 4. Tableau des champs impactés

| Champ | Table | Valeur après clic | Attendu | Utilisé où |
|-------|-------|-------------------|---------|------------|
| `unread_count` | `whatsapp_chat` | `0` ✅ | `0` | Badge non-lu |
| `updatedAt` | `whatsapp_chat` | `NOW()` (heure du clic) ❌ | inchangé | Tri liste conversations |
| `last_activity_at` | `whatsapp_chat` | inchangé ✅ | inchangé | ClientInfoBanner |
| `last_client_message_at` | `whatsapp_chat` | inchangé ✅ | inchangé | ClientInfoBanner |
| `timestamp` | `whatsapp_message` | inchangé ✅ | inchangé | ConversationItem, ChatMessage |
| `status` | `whatsapp_message` | `READ` ✅ | `READ` | Icône status |
| `updatedAt` | `whatsapp_message` | `NOW()` (heure du clic) ❌ | inchangé | (non affiché directement) |

---

## 5. Pourquoi l'heure du clic apparaît à l'écran

### Scénario le plus probable (Bug #1 + #4 combinés)

1. Client envoie message à **14h30** → `lastMessage.timestamp = 14h30` en DB ✅
2. Frontend reçoit le message → `addMessage()` → `conversation.lastMessage.timestamp = 14h30` ✅
3. Commercial clique à **15h45** :
   - `messages:read` → backend → `markChatAsRead` → `chat.updatedAt = 15h45` ❌
   - Backend émet `CONVERSATION_UPSERT` avec `updatedAt = 15h45`
   - **SI** `lastMessage.timestamp` est `null` en DB → gateway envoie `timestamp: null`
   - Frontend : `new Date(null || undefined || Date.now())` = **15h45** ← HEURE DU CLIC ❌
4. `updateConversation()` **remplace entièrement** la conversation en state
5. `ConversationItem` affiche `lastMessage.timestamp = 15h45` ❌

### Scénario secondaire (Bug #1 seul)

Si `lastMessage.timestamp` est correct, seul `conversation.updatedAt` est corrompu à **15h45**. Si un composant quelconque affiche `conversation.updatedAt`, il montrera l'heure du clic.

---

## 6. Fichiers concernés

| Fichier | Lignes | Rôle | Bug |
|---------|--------|------|-----|
| `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` | 89-99 | `markChatAsRead` | **#1 – Principal** |
| `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | 242-249 | `@UpdateDateColumn` | #1 (mécanisme) |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` | 483-493 | `findBychat_id` marque READ | **#2** |
| `message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity.ts` | 239-246 | `@UpdateDateColumn` message | #2 (mécanisme) |
| `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` | 26, 178 | Tri `updatedAt DESC` | **#3** |
| `front/src/types/chat.ts` | 544 | `transformToMessage` fallback | **#4** |
| `front/src/components/chat/ChatMessage.tsx` | 56 | Fallback `new Date()` | **#4** |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` | 499 | Tri `createdAt` au lieu de `timestamp` | #5 |

---

## 7. Recommandations de correction

### Fix #1 (PRIORITAIRE) – Éviter la corruption de `updatedAt` lors du marquage comme lu

**Option A – SQL brut (bypasse TypeORM @UpdateDateColumn) :**
```typescript
// whatsapp_chat.service.ts
async markChatAsRead(chat_id: string): Promise<void> {
  await this.chatRepository.query(
    `UPDATE whatsapp_chat SET unread_count = 0 WHERE chat_id = ?`,
    [chat_id],
  );
}
```

**Option B – Champ dédié `last_read_at` :**
Ajouter un champ `last_read_at: Date` dans l'entité et l'utiliser pour le marquage lu, sans toucher à `updatedAt`.

---

### Fix #2 (PRIORITAIRE) – Séparer la lecture et le marquage comme lu dans le service message

```typescript
// whatsapp_message.service.ts
async findBychat_id(chat_id: string, limit = 100, offset = 0) {
  // Supprimer l'UPDATE ici → le déplacer dans une méthode séparée
  return this.messageRepository.find({
    where: { chat_id },
    relations: ['chat', 'poste', 'medias'],
    order: { timestamp: 'ASC' },  // Fix #5 aussi
    take: limit,
    skip: offset,
  });
}

// Nouvelle méthode dédiée :
async markIncomingMessagesAsRead(chat_id: string): Promise<void> {
  await this.messageRepository.query(
    `UPDATE whatsapp_message SET status = 'READ'
     WHERE chat_id = ? AND direction = 'IN' AND status != 'READ'`,
    [chat_id],
  );
}
```

Appeler `markIncomingMessagesAsRead` séparément dans le gateway, sans passer par `findBychat_id`.

---

### Fix #3 – Trier par `last_activity_at` au lieu de `updatedAt`

```typescript
// whatsapp_chat.service.ts
// findByPosteId :
order: { last_activity_at: 'DESC' }

// findAll :
.orderBy('chat.last_activity_at', 'DESC')
```

---

### Fix #4 – Supprimer les fallbacks dangereux vers `Date.now()`

```typescript
// front/src/types/chat.ts - transformToMessage
timestamp: raw.timestamp
  ? new Date(raw.timestamp)
  : raw.createdAt
    ? new Date(raw.createdAt)
    : null,  // laisser null plutôt que Date.now()
```

```tsx
// front/src/components/chat/ChatMessage.tsx
const messageTimestamp = msg.timestamp instanceof Date ? msg.timestamp : null;
// Afficher '--:--' si null plutôt que l'heure courante
```

---

### Fix #5 – Trier les messages par `timestamp` (heure WhatsApp) pas `createdAt`

```typescript
// whatsapp_message.service.ts - findBychat_id
order: { timestamp: 'ASC' },
```

---

## 8. État actuel des fichiers avec modifications en attente

```
M  front/src/components/chat/ClientInfoBanner.tsx
M  front/src/types/chat.ts
M  message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts
M  message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts
```

Ces fichiers sont déjà modifiés sur la branche `inification`. Les corrections des bugs identifiés dans cet audit devront être appliquées en cohérence avec ces modifications existantes.

---

## 9. Conclusion

**Cause racine principale :** `TypeORM @UpdateDateColumn` met automatiquement à jour `updatedAt = NOW()` lors de tout appel à `repository.update()`, même si `updatedAt` n'est pas dans les champs à modifier. Ainsi, `markChatAsRead` (qui ne veut mettre à jour que `unread_count`) corrompt `updatedAt` avec l'heure du clic.

**Cause racine secondaire :** `findBychat_id` (service message) effectue une opération d'écriture (marquage READ) à l'intérieur d'une opération de lecture, ce qui corrompt également `updatedAt` sur les messages, et mélange les responsabilités.

**Impact DB confirmé :** `whatsapp_chat.updatedAt` et `whatsapp_message.updatedAt` changent à l'heure du clic, pas à l'heure du dernier message.

**Impact visuel :** Si `lastMessage.timestamp` en DB est null pour certains messages (données historiques), le frontend affiche `Date.now()` (heure du clic) via le fallback dans `transformToMessage`. La liste des conversations est également réordonnée de façon incorrecte.
