# Plan de correction – Bug Timestamp au marquage comme lu

**Basé sur :** `audit-timestamp-bug.md`
**Branche :** `inification`
**Priorité :** Haute

---

## Vue d'ensemble

| # | Correction | Fichier | Complexité | Priorité |
|---|-----------|---------|------------|----------|
| C1 | `markChatAsRead` → SQL brut sans `updatedAt` | `whatsapp_chat.service.ts` | Faible | 🔴 Critique |
| C2 | Séparer lecture et marquage READ dans `findBychat_id` | `whatsapp_message.service.ts` | Moyenne | 🔴 Critique |
| C3 | Mettre à jour `handleMarkAsRead` dans le gateway | `whatsapp_message.gateway.ts` | Faible | 🔴 Critique |
| C4 | Trier la liste des conversations par `last_activity_at` | `whatsapp_chat.service.ts` | Faible | 🟠 Haute |
| C5 | Supprimer le fallback `Date.now()` dans `transformToMessage` | `front/src/types/chat.ts` | Faible | 🟠 Haute |
| C6 | Supprimer le fallback `new Date()` dans `ChatMessage` | `front/src/components/chat/ChatMessage.tsx` | Faible | 🟠 Haute |
| C7 | Trier les messages par `timestamp` au lieu de `createdAt` | `whatsapp_message.service.ts` | Faible | 🟡 Moyenne |

---

## C1 – `markChatAsRead` : utiliser SQL brut pour éviter `@UpdateDateColumn`

### Problème
`chatRepository.update()` déclenche automatiquement `@UpdateDateColumn` → `whatsapp_chat.updatedAt = NOW()` même si on ne veut mettre à jour que `unread_count`.

### Fichier
`message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` — lignes 89-99

### Avant
```typescript
async markChatAsRead(chat_id: string): Promise<void> {
  const chat = await this.chatRepository.update(
    { chat_id: chat_id },
    {
      unread_count: 0,
    },
  );
  this.logger.debug(`Chat marked as read (${chat_id})`);
}
```

### Après
```typescript
async markChatAsRead(chat_id: string): Promise<void> {
  await this.chatRepository.query(
    `UPDATE whatsapp_chat SET unread_count = 0 WHERE chat_id = ?`,
    [chat_id],
  );
  this.logger.debug(`Chat marked as read (${chat_id})`);
}
```

### Pourquoi SQL brut ?
`repository.query()` bypasse le système de hooks TypeORM. `@UpdateDateColumn` n'est pas déclenché. `updatedAt` reste à sa valeur précédente (heure du dernier message reçu).

### Tests à vérifier
- `unread_count` passe bien à `0` ✓
- `updatedAt` ne change **pas** après le clic ✓
- `last_activity_at` ne change pas ✓

---

## C2 – Séparer lecture et marquage READ dans `findBychat_id`

### Problème
`messageService.findBychat_id()` fait deux choses à la fois :
1. Marque les messages comme READ (écriture)
2. Retourne la liste des messages (lecture)

Cela corrompt `whatsapp_message.updatedAt` de tous les messages entrants à chaque ouverture de conversation.

### Fichier
`message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` — lignes 467-509

### Avant
```typescript
async findBychat_id(chat_id: string, limit = 100, offset = 0) {
  // 1️⃣ Marquer comme lus
  await this.messageRepository
    .createQueryBuilder()
    .update(WhatsappMessage)
    .set({ status: WhatsappMessageStatus.READ })
    .where('chat_id = :chat_id', { chat_id })
    .andWhere('direction = :direction', { direction: MessageDirection.IN })
    .andWhere('status != :status', { status: WhatsappMessageStatus.READ })
    .execute();

  // 2️⃣ Récupérer les messages
  const mess = await this.messageRepository.find({
    where: { chat_id: chat_id },
    relations: ['chat', 'poste', 'medias'],
    order: { createdAt: 'ASC' },
    take: limit,
    skip: offset,
  });
  return mess;
}
```

### Après
```typescript
// Méthode de lecture pure — ne modifie rien
async findBychat_id(chat_id: string, limit = 100, offset = 0) {
  const mess = await this.messageRepository.find({
    where: { chat_id: chat_id },
    relations: ['chat', 'poste', 'medias'],
    order: { timestamp: 'ASC' },  // Fix C7 inclus
    take: limit,
    skip: offset,
  });
  return mess;
}

// Nouvelle méthode dédiée au marquage READ (SQL brut, sans @UpdateDateColumn)
async markIncomingMessagesAsRead(chat_id: string): Promise<void> {
  await this.messageRepository.query(
    `UPDATE whatsapp_message
     SET status = 'READ'
     WHERE chat_id = ?
       AND direction = 'IN'
       AND status != 'READ'`,
    [chat_id],
  );
  this.logger.debug(`Messages marked as read for chat ${chat_id}`);
}
```

### Tests à vérifier
- `findBychat_id` ne fait plus de UPDATE ✓
- `whatsapp_message.updatedAt` ne change plus à l'ouverture ✓
- Les messages sont retournés dans le bon ordre (par `timestamp`) ✓
- `markIncomingMessagesAsRead` met bien le status à `READ` ✓

---

## C3 – Mettre à jour `handleMarkAsRead` dans le gateway

### Problème
Après C2, le gateway doit explicitement appeler `markIncomingMessagesAsRead` dans le handler `messages:read`, car `findBychat_id` ne le fait plus.

### Fichier
`message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` — lignes 477-506

### Avant
```typescript
@SubscribeMessage('messages:read')
async handleMarkAsRead(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { chat_id: string },
) {
  if (!this.throttle.allow(client.id, 'messages:read')) {
    return this.emitRateLimited(client, 'messages:read');
  }
  const tenantIds = this.getTenantIds(client);
  await this.chatService.markChatAsRead(payload.chat_id);

  const chat = await this.chatService.findBychat_id(payload.chat_id);
  if (!chat) return;
  if (!this.isAllowedTenantChat(chat, tenantIds)) return;

  const lastMessage = await this.messageService.findLastMessageBychat_id(
    chat.chat_id,
  );

  if (!chat.tenant_id) { ... return; }
  this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
    type: 'CONVERSATION_UPSERT',
    payload: this.mapConversation(chat, lastMessage, 0),
  });
}
```

### Après
```typescript
@SubscribeMessage('messages:read')
async handleMarkAsRead(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { chat_id: string },
) {
  if (!this.throttle.allow(client.id, 'messages:read')) {
    return this.emitRateLimited(client, 'messages:read');
  }
  const tenantIds = this.getTenantIds(client);

  // Marquer le chat comme lu (unread_count = 0, sans toucher updatedAt)
  await this.chatService.markChatAsRead(payload.chat_id);

  // Marquer les messages entrants comme READ (séparé de findBychat_id)
  await this.messageService.markIncomingMessagesAsRead(payload.chat_id);

  const chat = await this.chatService.findBychat_id(payload.chat_id);
  if (!chat) return;
  if (!this.isAllowedTenantChat(chat, tenantIds)) return;

  const lastMessage = await this.messageService.findLastMessageBychat_id(
    chat.chat_id,
  );

  if (!chat.tenant_id) { ... return; }
  this.server.to(`tenant:${chat.tenant_id}`).emit('chat:event', {
    type: 'CONVERSATION_UPSERT',
    payload: this.mapConversation(chat, lastMessage, 0),
  });
}
```

### Tests à vérifier
- `messages:read` marque bien le chat ET les messages ✓
- `messages:get` ne marque plus les messages (C2) ✓
- L'événement `CONVERSATION_UPSERT` est toujours émis ✓

---

## C4 – Trier la liste des conversations par `last_activity_at`

### Problème
`findAll` et `findByPosteId` trient par `updatedAt DESC`. Après un marquage comme lu, `updatedAt = heure_du_clic` → la conversation remonte en tête de liste à tort.

`last_activity_at` est mis à jour uniquement lors de la réception d'un nouveau message client (`incrementUnreadCount`) → c'est le bon champ pour trier.

### Fichier
`message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts` — lignes 26 et 178

### Avant (ligne 26)
```typescript
order: { updatedAt: 'DESC' },
```

### Après (ligne 26)
```typescript
order: { last_activity_at: 'DESC' },
```

### Avant (ligne 178)
```typescript
.orderBy('chat.updatedAt', 'DESC')
```

### Après (ligne 178)
```typescript
.orderBy('chat.last_activity_at', 'DESC')
```

### Note
`last_activity_at` peut être `NULL` pour les vieilles conversations. Ajouter un fallback si nécessaire :
```typescript
.orderBy('COALESCE(chat.last_activity_at, chat.createdAt)', 'DESC')
```

### Tests à vérifier
- Après marquage comme lu, la conversation ne remonte pas en tête ✓
- La liste reste triée par heure du dernier message reçu ✓
- Les nouvelles conversations (sans message) s'affichent en fin de liste ✓

---

## C5 – Supprimer le fallback `Date.now()` dans `transformToMessage`

### Problème
Si `raw.timestamp` est `null` ou `undefined`, le fallback `Date.now()` affiche l'heure courante comme timestamp du message.

### Fichier
`front/src/types/chat.ts` — ligne 544

### Avant
```typescript
timestamp: new Date(raw.timestamp || raw.createdAt || Date.now()),
```

### Après
```typescript
timestamp: raw.timestamp
  ? new Date(raw.timestamp)
  : raw.createdAt
    ? new Date(raw.createdAt)
    : new Date(0),  // epoch visible → signale un problème de données plutôt que de masquer
```

### Alternative plus stricte
```typescript
// Logguer si timestamp manquant, mais ne pas afficher l'heure courante
timestamp: (() => {
  const val = raw.timestamp ?? raw.createdAt;
  if (!val) {
    console.warn('[transformToMessage] timestamp manquant pour message', raw.id);
    return new Date(0);
  }
  return new Date(val);
})(),
```

### Tests à vérifier
- Les messages avec timestamp valide s'affichent correctement ✓
- Les messages sans timestamp affichent `01/01/1970` (signale un bug de données) ✓
- L'heure du clic n'apparaît plus pour les messages sans timestamp ✓

---

## C6 – Supprimer le fallback `new Date()` dans `ChatMessage`

### Problème
Si `msg.timestamp` est falsy, `new Date()` = heure courante est utilisée comme timestamp d'affichage dans la bulle du message.

### Fichier
`front/src/components/chat/ChatMessage.tsx` — ligne 56

### Avant
```typescript
const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
```

### Après
```typescript
const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : null;
```

Et dans le JSX (ligne 197) :
```tsx
// Avant
<span>{formatTime(messageTimestamp)}</span>

// Après — formatTime gère déjà null (retourne '--:--')
<span>{formatTime(messageTimestamp)}</span>
```

`formatTime` dans `dateUtils.ts` retourne déjà `'--:--'` si la valeur est null grâce à `safeDate()`.

### Tests à vérifier
- Messages avec timestamp valide : heure affichée correctement ✓
- Messages sans timestamp : affiche `--:--` ✓
- Aucun message n'affiche l'heure courante par défaut ✓

---

## C7 – Trier les messages par `timestamp` (heure WhatsApp) au lieu de `createdAt`

### Problème
`findBychat_id` trie par `createdAt ASC` (heure d'insertion en DB). Pour les messages rétro-importés ou avec un délai, l'ordre peut différer de l'ordre chronologique réel WhatsApp.

### Fichier
`message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts` — ligne 499

### Avant
```typescript
order: { createdAt: 'ASC' },
```

### Après
```typescript
order: { timestamp: 'ASC' },
```

**Note :** Ce fix est inclus dans C2 (la nouvelle version de `findBychat_id`).

---

## Ordre d'implémentation recommandé

```
1. C1 – markChatAsRead (backend)
   └── Correction isolée, sans impact sur le reste

2. C2 – findBychat_id refactor (backend)
   └── Sépare lecture et écriture

3. C3 – handleMarkAsRead mise à jour (backend)
   └── Dépend de C2 (nouvelle méthode markIncomingMessagesAsRead)

4. C4 – Tri par last_activity_at (backend)
   └── Correction indépendante

5. C5 – transformToMessage fallback (frontend)
   └── Correction indépendante

6. C6 – ChatMessage fallback (frontend)
   └── Correction indépendante
```

**C7 est inclus dans C2**, pas besoin de passe séparée.

---

## Checklist de validation finale

### Backend
- [ ] `markChatAsRead` → `whatsapp_chat.updatedAt` ne change plus après le clic
- [ ] `findBychat_id` (message service) → ne fait plus d'UPDATE
- [ ] `markIncomingMessagesAsRead` → méthode dédiée SQL brut existe et fonctionne
- [ ] `handleMarkAsRead` → appelle `markIncomingMessagesAsRead` explicitement
- [ ] Liste conversations → triée par `last_activity_at DESC`
- [ ] `CONVERSATION_UPSERT` après `messages:read` → `last_message.timestamp` = heure réelle du message

### Frontend
- [ ] `transformToMessage` → plus de fallback `Date.now()`
- [ ] `ChatMessage` → `messageTimestamp` peut être `null`, affiche `--:--`
- [ ] `ConversationItem` → l'heure du dernier message ne change plus après clic
- [ ] `ClientInfoBanner` → `last_activity_at` affiche toujours l'heure du dernier message client
- [ ] La conversation ne remonte plus en tête de liste après ouverture

### Base de données
- [ ] Après `messages:read` : seul `unread_count` a changé sur `whatsapp_chat`
- [ ] `whatsapp_chat.updatedAt` = inchangé (heure du dernier vrai événement)
- [ ] `whatsapp_message.updatedAt` = inchangé après `messages:get`
- [ ] `whatsapp_message.status` passe bien à `READ` pour les messages IN
