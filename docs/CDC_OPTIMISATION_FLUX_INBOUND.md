# Cahier des Charges — Optimisation du Flux de Réception des Messages WhatsApp

**Projet** : WhatsApp Business Platform  
**Module** : Traitement des messages entrants (inbound)  
**Auteur** : kevin voli  
**Date** : 2026-04-02  
**Statut** : En attente d'implémentation  

---

## 1. Contexte et Objectif

### 1.1 Contexte

Chaque message WhatsApp entrant suit un pipeline synchrone de **15 à 20 requêtes SQL** avant d'être affiché chez le commercial. Ce pipeline présente plusieurs goulots d'étranglement qui augmentent la latence perçue et limitent la capacité de traitement en charge.

### 1.2 Flux actuel résumé

```
Webhook → Validation → Normalisation → [MUTEX GLOBAL dispatcher]
  → assignConversation (2–5 SQL)
  → saveMessage (5 SQL séquentiels)
  → saveMedias (2 SQL × N médias)
  → findOneWithMedias (1 SQL avec 5 JOINs)
  → chatService.update (1 SQL)
  → notifyNewMessage
      → findLastMessage (1 SQL) ← REDONDANT
      → countUnread (1 SQL)
      → socket.emit MESSAGE_ADD
      → socket.emit CONVERSATION_UPSERT
```

**Latence mesurée estimée** : 650 ms – 1 200 ms par message en conditions normales.  
**En pic (10 messages simultanés)** : jusqu'à 5–10 secondes d'attente pour les derniers messages (sérialisation du mutex global).

### 1.3 Objectif

Réduire la latence bout-en-bout du pipeline inbound de **~60 %**, passer de 15–20 SQL à **8–10 SQL maximum** par message, et éliminer la sérialisation globale au niveau du dispatcher.

**Cible** : affichage du message chez le commercial en **< 300 ms** dans 95 % des cas.

---

## 2. Périmètre

### 2.1 Fichiers concernés

| Fichier | Rôle |
|---|---|
| `src/dispatcher/dispatcher.service.ts` | Assignation des conversations aux postes |
| `src/dispatcher/services/queue.service.ts` | Gestion de la file d'attente des postes |
| `src/webhooks/inbound-message.service.ts` | Orchestration du traitement inbound |
| `src/whatsapp_message/whatsapp_message.service.ts` | CRUD messages + médias |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | Émission WebSocket vers les commerciaux |

### 2.2 Hors périmètre

- Schéma de base de données (pas de migration)
- API REST exposée aux clients
- Frontend commercial (`front/`)
- Panel admin (`admin/`)
- Tests existants (maintien de la couverture actuelle)

---

## 3. Analyse des Problèmes

### 3.1 Problème P1 — Mutex dispatcher global (CRITIQUE)

**Fichier** : `dispatcher.service.ts`, ligne 17  
**Code actuel** :

```typescript
// dispatcher.service.ts : ligne 17
private readonly dispatchLock = new Mutex();

// ligne 38-52
async assignConversation(
  clientPhone: string,
  clientName: string,
  traceId?: string,
  tenantId?: string,
): Promise<WhatsappChat | null> {
  return this.dispatchLock.runExclusive(() =>        // ← UN SEUL MUTEX POUR TOUS LES CHATS
    this.assignConversationInternal(clientPhone, clientName, traceId, tenantId),
  );
}
```

**Impact** : Tous les messages — quelle que soit la conversation — attendent le même verrou. Si 10 messages arrivent en 1 seconde, le 10ème attend que les 9 précédents soient intégralement traités.

**Cause racine** : Le mutex protège l'intégrité de l'assignation, mais il est global alors que deux conversations distinctes ne partagent aucune ressource.

---

### 3.2 Problème P2 — Rechargement inutile du dernier message (CRITIQUE)

**Fichiers** : `inbound-message.service.ts` (ligne 117) + `whatsapp_message.gateway.ts` (ligne 787)

**Code actuel** :

```typescript
// inbound-message.service.ts : ligne 117
const fullMessage = await this.whatsappMessageService.findOneWithMedias(savedMessage.id);
// → On a le message complet ici

// whatsapp_message.gateway.ts : ligne 787-792
async notifyNewMessage(message: WhatsappMessage, chat: WhatsappChat) {
  // ...
  const lastMessage = await this.messageService.findLastMessageBychat_id(chat.chat_id);
  // ← IDENTIQUE à fullMessage : c'est le message qu'on vient de créer
  const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);
}
```

**Impact** : 2 requêtes SQL inutiles (1 SELECT ORDER BY DESC + 1 COUNT) pour chaque message entrant.

---

### 3.3 Problème P3 — Awaits séquentiels pouvant être parallèles (MODÉRÉ)

**Fichier** : `inbound-message.service.ts`, lignes 128–142

**Code actuel** :

```typescript
// Étape A — lecture channel (independant de B)
const channel = await this.channelService.findOne(data.channel_id);

// Étape B — findOrCreate contact (indépendant de A)
const contact = await this.contactService.findOrCreate(phone, chatId, name);

// Étape C — update chat (dépend du résultat de A et B)
await this.chatService.update(conversation.chat_id, { ... });
```

**Impact** : A et B sont indépendants mais exécutés séquentiellement. Gain potentiel : ~30–50 ms par message.

---

### 3.4 Problème P4 — Lookup channel répété dans la boucle médias (MODÉRÉ)

**Fichier** : `inbound-message.service.ts`, lignes 106–114

**Code actuel** :

```typescript
for (const media of medias) {
  await this.saveMedia(media, savedMessage, conversation, {
    channelId: message.channelId,   // ← même channelId à chaque itération
  });
  // À l'intérieur de saveMedia :
  // const resolvedChannel = await this.channelService.findByChannelId(context.channelId);
  // ← même requête SQL répétée N fois
}
```

**Impact** : Si un message contient 3 médias → 3 requêtes SQL identiques pour le même channel.

---

### 3.5 Problème P5 — SELECT * avec 5 JOINs dans findOneWithMedias (MINEUR)

**Fichier** : `whatsapp_message.service.ts`, lignes 862–873

**Code actuel** :

```typescript
async findOneWithMedias(id: string) {
  return await this.messageRepository.findOne({
    where: { id },
    relations: {
      medias: true,
      chat: true,    // ← toutes les colonnes du chat (30+ colonnes)
      poste: true,   // ← toutes les colonnes du poste
      contact: true, // ← toutes les colonnes du contact
      quotedMessage: true,
    },
  });
}
```

**Colonnes réellement utilisées** pour l'émission WebSocket : `message.*`, `medias.url/type/caption`, `chat.chat_id/poste_id/name`. Toutes les autres colonnes sont inutiles dans ce contexte.

---

### 3.6 Problème P6 — 2 awaits séquentiels dans notifyNewMessage (MINEUR)

**Fichier** : `whatsapp_message.gateway.ts`, lignes 787–795

**Code actuel** :

```typescript
const lastMessage = await this.messageService.findLastMessageBychat_id(chat.chat_id);
const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);
// Ces deux requêtes sont indépendantes
```

**Impact** : Latence additionnelle inutile de ~10–20 ms (2 aller-retours DB séquentiels).

---

## 4. Spécifications des Optimisations

---

### OPT-1 : Remplacer le mutex global par des mutex par `chat_id`

**Priorité** : CRITIQUE  
**Fichier** : `dispatcher.service.ts`  
**Effort estimé** : 2h

#### Description

Supprimer le `dispatchLock` global unique et le remplacer par une `Map<chat_id, Mutex>` identique au pattern déjà utilisé dans `inbound-message.service.ts` (lignes 31–40).

Deux conversations différentes peuvent ainsi être assignées **en parallèle**. Seuls deux messages du **même chat** s'attendent mutuellement.

#### Code avant

```typescript
// dispatcher.service.ts : ligne 17
private readonly dispatchLock = new Mutex();

async assignConversation(...): Promise<WhatsappChat | null> {
  return this.dispatchLock.runExclusive(() =>
    this.assignConversationInternal(clientPhone, clientName, traceId, tenantId),
  );
}
```

#### Code après

```typescript
// dispatcher.service.ts
private readonly chatDispatchLocks = new Map<string, Mutex>();

private getChatDispatchLock(chatId: string): Mutex {
  let mutex = this.chatDispatchLocks.get(chatId);
  if (!mutex) {
    mutex = new Mutex();
    this.chatDispatchLocks.set(chatId, mutex);
  }
  return mutex;
}

async assignConversation(
  clientPhone: string,
  clientName: string,
  traceId?: string,
  tenantId?: string,
): Promise<WhatsappChat | null> {
  return this.getChatDispatchLock(clientPhone).runExclusive(() =>
    this.assignConversationInternal(clientPhone, clientName, traceId, tenantId),
  );
}
```

#### Nettoyage mémoire

Ajouter une purge périodique des mutex inactifs (optionnel, les mutex Zustand sont légers) ou les supprimer après usage :

```typescript
async assignConversation(clientPhone: string, ...): Promise<WhatsappChat | null> {
  const lock = this.getChatDispatchLock(clientPhone);
  try {
    return await lock.runExclusive(() =>
      this.assignConversationInternal(clientPhone, ...),
    );
  } finally {
    // Libérer si plus personne n'attend
    if (!lock.isLocked()) {
      this.chatDispatchLocks.delete(clientPhone);
    }
  }
}
```

#### Critères de validation

- [ ] Deux messages de chats différents sont traités en parallèle (observable via logs `trace=`)
- [ ] Deux messages du même chat restent séquentiels (pas de race condition)
- [ ] Les tests existants de dispatch passent sans modification

---

### OPT-2 : Passer `fullMessage` à `notifyNewMessage` pour éviter le rechargement

**Priorité** : CRITIQUE  
**Fichiers** : `inbound-message.service.ts` + `whatsapp_message.gateway.ts`  
**Effort estimé** : 1h

#### Description

`fullMessage` est chargé à la ligne 117 de `inbound-message.service.ts`. Il est ensuite passé à `notifyNewMessage()` qui recharge inutilement le dernier message via `findLastMessageBychat_id()`.

Il suffit de **passer `fullMessage` directement** comme `lastMessage` dans `notifyNewMessage`.

#### Changement dans `whatsapp_message.gateway.ts`

**Signature actuelle** (ligne 760) :
```typescript
async notifyNewMessage(message: WhatsappMessage, chat: WhatsappChat): Promise<void>
```

**Nouvelle signature** :
```typescript
async notifyNewMessage(
  message: WhatsappMessage,
  chat: WhatsappChat,
  lastMessage?: WhatsappMessage,  // ← paramètre optionnel (rétrocompatible)
): Promise<void>
```

**Corps actuel** (lignes 787–799) :
```typescript
const lastMessage = await this.messageService.findLastMessageBychat_id(chat.chat_id);
const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);

this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
  type: 'CONVERSATION_UPSERT',
  payload: this.mapConversation(chat, lastMessage, unreadCount),
});
```

**Corps après** :
```typescript
// Utiliser le lastMessage fourni, sinon recharger (fallback pour autres appelants)
const resolvedLastMessage = lastMessage
  ?? await this.messageService.findLastMessageBychat_id(chat.chat_id);

const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);

this.server.to(`poste:${chat.poste_id}`).emit('chat:event', {
  type: 'CONVERSATION_UPSERT',
  payload: this.mapConversation(chat, resolvedLastMessage, unreadCount),
});
```

#### Changement dans `inbound-message.service.ts`

**Appel actuel** (ligne 142) :
```typescript
await this.messageGateway.notifyNewMessage(fullMessage, conversation);
```

**Appel après** :
```typescript
await this.messageGateway.notifyNewMessage(fullMessage, conversation, fullMessage);
```

#### Critères de validation

- [ ] Le CONVERSATION_UPSERT contient bien le nouveau message comme `last_message`
- [ ] Aucune query `findLastMessageBychat_id` n'est émise lors d'un message entrant standard
- [ ] Les autres appelants de `notifyNewMessage` continuent de fonctionner (signature rétrocompatible)

---

### OPT-3 : Paralléliser les requêtes indépendantes dans le pipeline inbound

**Priorité** : MODÉRÉE  
**Fichier** : `inbound-message.service.ts`  
**Effort estimé** : 1h

#### Description

Dans `saveIncomingFromUnified()` (appelé à la ligne 94), plusieurs lectures en base sont indépendantes et peuvent être exécutées en parallèle avec `Promise.all`.

#### Code avant (schéma)

```typescript
// whatsapp_message.service.ts — saveIncomingFromUnified
const existing = await this.messageRepository.findOne({ where: { provider_message_id } });
if (existing) return existing;

const channel = await this.channelService.findOne(channelId);          // → SQL 1
const contact = await this.contactService.findOrCreate(phone, ...);    // → SQL 2 (indépendant de SQL 1)
```

#### Code après

```typescript
const existing = await this.messageRepository.findOne({ where: { provider_message_id } });
if (existing) return existing;

const [channel, contact] = await Promise.all([
  this.channelService.findOne(channelId),
  this.contactService.findOrCreate(phone, chatId, name),
]);
```

#### Application dans `notifyNewMessage` (OPT-3b)

Même logique pour les deux requêtes de comptage qui restent après OPT-2 :

```typescript
// whatsapp_message.gateway.ts — notifyNewMessage
// Avant
const lastMessage = resolvedLastMessage; // déjà résolu par OPT-2
const unreadCount = await this.messageService.countUnreadMessages(chat.chat_id);

// Ces deux lignes restent séquentielles si on doit les faire, mais en cas de
// fallback (lastMessage non fourni) :
const [resolvedLastMsg, unreadCount] = await Promise.all([
  lastMessage ?? this.messageService.findLastMessageBychat_id(chat.chat_id),
  this.messageService.countUnreadMessages(chat.chat_id),
]);
```

#### Critères de validation

- [ ] Le comportement fonctionnel est identique (même résultat en BDD)
- [ ] Pas de race condition sur `findOrCreate` (vérifier que le UNIQUE constraint gère les doublons)

---

### OPT-4 : Résoudre le channel une seule fois pour la boucle médias

**Priorité** : MODÉRÉE  
**Fichier** : `inbound-message.service.ts`, lignes 106–114  
**Effort estimé** : 30 min

#### Description

Dans la boucle de sauvegarde des médias, `saveMedia()` appelle `channelService.findByChannelId()` à chaque itération avec le même `channelId`. Il faut résoudre le channel **avant** la boucle et le passer en paramètre.

#### Code avant

```typescript
// inbound-message.service.ts : lignes 106-114
for (const media of medias) {
  await this.saveMedia(media, savedMessage, conversation, {
    tenantId: message.tenantId,
    provider: message.provider,
    providerMediaId: message.media?.id,
    channelId: message.channelId,   // ← même valeur à chaque tour
  });
  // Dans saveMedia() :
  // const resolvedChannel = await this.channelService.findByChannelId(context.channelId);
}
```

#### Code après

```typescript
// Résoudre le channel une seule fois avant la boucle
const resolvedChannel = medias.length > 0
  ? await this.channelService.findByChannelId(message.channelId)
  : null;

for (const media of medias) {
  await this.saveMedia(media, savedMessage, conversation, {
    tenantId: message.tenantId,
    provider: message.provider,
    providerMediaId: message.media?.id,
    channelId: message.channelId,
    resolvedChannel,               // ← passer l'objet déjà chargé
  });
}
```

Adapter la signature de `saveMedia()` pour accepter le `resolvedChannel` optionnel et ne pas rappeler `findByChannelId` si fourni.

#### Critères de validation

- [ ] Un message avec 3 médias génère 1 seul `SELECT` sur `channel` au lieu de 3
- [ ] Un message sans média ne génère aucun `SELECT` supplémentaire sur `channel`

---

### OPT-5 : Sélectionner uniquement les colonnes nécessaires dans findOneWithMedias

**Priorité** : MINEURE  
**Fichier** : `whatsapp_message.service.ts`, lignes 862–873  
**Effort estimé** : 30 min

#### Description

`findOneWithMedias` charge intégralement le chat (30+ colonnes) et le poste alors que seules quelques colonnes sont utilisées pour l'émission WebSocket.

#### Code avant

```typescript
async findOneWithMedias(id: string) {
  return await this.messageRepository.findOne({
    where: { id },
    relations: {
      medias: true,
      chat: true,
      poste: true,
      contact: true,
      quotedMessage: true,
    },
  });
}
```

#### Code après

```typescript
async findOneWithMedias(id: string) {
  return await this.messageRepository
    .createQueryBuilder('msg')
    .leftJoinAndSelect('msg.medias', 'medias')
    .leftJoin('msg.chat', 'chat')
    .addSelect(['chat.id', 'chat.chat_id', 'chat.poste_id', 'chat.name', 'chat.read_only'])
    .leftJoin('msg.contact', 'contact')
    .addSelect(['contact.id', 'contact.name', 'contact.phone'])
    .leftJoinAndSelect('msg.quotedMessage', 'quotedMessage')
    .where('msg.id = :id', { id })
    .getOne();
}
```

> **Note** : Supprimer la relation `poste` si elle n'est pas utilisée dans `mapMessage()`. Vérifier `gateway.mapMessage()` avant d'appliquer ce changement.

#### Critères de validation

- [ ] `mapMessage()` dans le gateway fonctionne avec les champs sélectionnés
- [ ] La payload WebSocket émise est identique à l'actuelle

---

## 5. Plan d'Implémentation

### 5.1 Ordre recommandé

Les optimisations sont **indépendantes** entre elles et peuvent être faites en une seule branche. L'ordre ci-dessous maximise le rapport gain/risque.

| Étape | Optimisation | Fichiers | Gain estimé | Risque |
|---|---|---|---|---|
| 1 | OPT-1 : mutex par chat_id | `dispatcher.service.ts` | **-80% latence en pic** | Moyen (logique de verrou) |
| 2 | OPT-2 : passer fullMessage | `inbound-message.service.ts`, `gateway.ts` | **-2 SQL/message** | Faible |
| 3 | OPT-3 : Promise.all inbound | `inbound-message.service.ts` | **-30ms/message** | Faible |
| 4 | OPT-4 : channel unique médias | `inbound-message.service.ts` | **-1 SQL/média** | Très faible |
| 5 | OPT-5 : SELECT colonnes ciblées | `whatsapp_message.service.ts` | **-20% taille réponse SQL** | Faible |

### 5.2 Comparatif SQL avant / après

| Métrique | Avant | Après | Gain |
|---|---|---|---|
| SQL par message sans média | 15–17 | **8–9** | **-45%** |
| SQL par message + 3 médias | 20–23 | **11–12** | **-48%** |
| Messages simultanés bloqués | 9/10 | **0** (mutex/chat) | **-100%** |
| Latence estimée en pic | 5–10s | **< 500ms** | **~-90%** |

### 5.3 Tests à écrire ou adapter

| Test | Type | Description |
|---|---|---|
| Dispatch concurrent (2 chats différents) | Intégration | Vérifier que 2 messages de chats distincts sont traités en parallèle |
| Dispatch concurrent (même chat) | Intégration | Vérifier qu'ils restent séquentiels et sans corruption |
| notifyNewMessage avec lastMessage fourni | Unitaire | Vérifier qu'aucune SQL n'est émise pour `findLastMessage` |
| saveMedia avec channel pré-résolu | Unitaire | Vérifier que `findByChannelId` n'est appelé qu'une fois |
| findOneWithMedias avec SELECT ciblé | Unitaire | Vérifier que `mapMessage()` reçoit les bons champs |

---

## 6. Risques et Points d'Attention

### 6.1 OPT-1 — Race condition sur la queue

Le `queueService.getNextInQueue()` possède son propre `queueLock` (ligne 22 de `queue.service.ts`). Avec le mutex par chat, plusieurs assignations peuvent appeler `getNextInQueue()` simultanément. Ce lock interne protège correctement la queue, **mais** vérifier que le comportement round-robin est maintenu sous charge concurrente.

### 6.2 OPT-1 — Croissance de la Map de mutex

La `chatDispatchLocks` Map peut croître si un grand nombre de chats distincts arrivent. La suppression du mutex après usage (voir section nettoyage mémoire) est recommandée en production.

### 6.3 OPT-3 — findOrCreate concurrents

`contactService.findOrCreate()` utilise un pattern SELECT puis INSERT conditionnel. Avec la parallélisation, deux messages du **même contact mais de chats différents** pourraient déclencher deux `findOrCreate` simultanés. S'assurer qu'il y a un `UNIQUE INDEX` sur `contact.phone` et que les erreurs de contrainte sont gérées gracieusement (catch + retry find).

### 6.4 OPT-5 — Compatibilité mapMessage

Avant d'appliquer OPT-5, auditer `mapMessage()` dans `whatsapp_message.gateway.ts` pour lister **toutes les propriétés** accédées sur `message.chat`, `message.poste`, et `message.contact`. La liste des colonnes sélectionnées doit couvrir l'intégralité de ces accès.

---

## 7. Définition de "Done"

Une optimisation est considérée terminée quand :

1. Le code est modifié selon les spécifications de la section 4
2. Les critères de validation de l'optimisation sont cochés
3. `npx tsc --noEmit` passe sans erreur
4. Les tests existants liés au dispatch et aux messages passent
5. Un test manuel end-to-end confirme que le message s'affiche correctement chez le commercial
6. Les logs montrent la réduction attendue du nombre de queries (via `logger.debug`)

---

## 8. Métriques de Succès

Mesurer avant et après chaque optimisation via les logs applicatifs existants (`trace=`) :

- **Temps total `INCOMING_RECEIVED` → `INCOMING_DISPATCHED`** : cible < 200 ms
- **Nombre de queries SQL loggées** par message (activer `logging: true` dans TypeORM le temps de la mesure)
- **Latence perçue côté commercial** : délai entre envoi client et apparition chez le commercial, cible < 300 ms à 95e percentile
