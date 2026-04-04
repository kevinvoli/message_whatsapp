# Cahier des Charges — Assignation d'un Channel à un Poste

> **Fonctionnalité** : Permettre à l'admin d'assigner un canal (channel) à un poste spécifique.
> Toutes les conversations provenant d'un channel assigné sont routées **exclusivement** vers ce poste.
> Aucun autre poste ne peut voir ni recevoir ces conversations.
>
> **Audit** : 2026-04-03
> **Priorité** : 🔴 Fonctionnelle — modifie le cœur du dispatch

---

## Sommaire

1. [Contexte et problème](#1-contexte-et-problème)
2. [Architecture actuelle (état des lieux)](#2-architecture-actuelle-état-des-lieux)
3. [Architecture cible](#3-architecture-cible)
4. [Règles métier](#4-règles-métier)
5. [Implémentation — Backend](#5-implémentation--backend)
   - [5.1 Migration BDD](#51-migration-bdd)
   - [5.2 Entité WhapiChannel](#52-entité-whapichannel)
   - [5.3 DTO](#53-dto)
   - [5.4 ChannelService](#54-channelservice)
   - [5.5 ChannelController — endpoint d'assignation](#55-channelcontroller--endpoint-dassignation)
   - [5.6 Dispatcher — routage par channel](#56-dispatcher--routage-par-channel)
   - [5.7 QueueService — getNextInQueueForPoste](#57-queueservice--getnextinqueueforposte)
   - [5.8 Gateway WebSocket — isolation des conversations](#58-gateway-websocket--isolation-des-conversations)
6. [Implémentation — Admin Frontend](#6-implémentation--admin-frontend)
   - [6.1 ChannelsView — sélecteur de poste](#61-channelsview--sélecteur-de-poste)
   - [6.2 PostesView — canaux assignés](#62-postesview--canaux-assignés)
   - [6.3 API admin](#63-api-admin)
7. [Cas limites et comportements attendus](#7-cas-limites-et-comportements-attendus)
8. [Tests à implémenter](#8-tests-à-implémenter)
9. [Ordre d'implémentation](#9-ordre-dimplémentation)

---

## 1. Contexte et problème

### Situation actuelle

L'application gère plusieurs **channels** (canaux de communication) par tenant :
- WhatsApp Business (Meta Cloud API)
- WhatsApp (WHAPI)
- Instagram
- Messenger
- Telegram

Tous les messages entrants, **quel que soit leur channel d'origine**, alimentent une **queue globale unique**. Le dispatcher assigne chaque conversation au **premier poste disponible** dans cette queue, sans tenir compte du canal d'où vient le message.

Cela signifie :
- Un message provenant du channel "WhatsApp VIP" peut être reçu par n'importe quel poste
- Un message provenant du channel "Support Technique" peut atterrir sur le poste "Commercial"
- Il est impossible de dédier un canal à une équipe ou un poste précis

### Besoin

L'admin doit pouvoir assigner un channel à un poste précis. Une fois assigné :
- Tout message entrant sur ce channel est **routé exclusivement vers ce poste**
- Aucun autre poste ne reçoit ces conversations
- Le poste assigné voit **uniquement les conversations de ses channels** (et pas celles des channels non assignés à lui)

---

## 2. Architecture actuelle (état des lieux)

### Flux actuel d'un message entrant

```
Webhook reçu (WHAPI / Meta / Instagram / ...)
        │
        ↓ channel_id extrait de l'URL ou du payload
UnifiedIngressService.ingest()
        │
        ↓ tenantId résolu via channel_id
DispatcherService.assignConversation(chatId, name, traceId, tenantId)
        │
        ↓ IGNORE le channel_id
QueueService.getNextInQueue()   ← queue GLOBALE tous postes
        │
        ↓ retourne le premier poste disponible
chat.poste_id = nextPoste.id    ← assignation aveugle au channel
chat.channel_id = channel.id    ← sauvegardé, mais non utilisé pour le routing
        │
        ↓
Gateway.sendConversationsToClient(posteId)
  → findByPosteId(posteId)     ← filtre par poste UNIQUEMENT
  → TOUTES les convs du poste, peu importe le channel
```

### Ce qui existe déjà

| Élément | État | Notes |
|---------|------|-------|
| `whatsapp_chat.channel_id` | ✅ Existe | Sauvegardé à la réception du message |
| `whatsapp_chat.poste_id` | ✅ Existe | Assigné par le dispatcher |
| `WhapiChannel.poste_id` | ❌ Absent | **À créer** |
| Queue globale | ✅ Existe | `QueueService.getNextInQueue()` |
| Queue par channel | ❌ Absent | **À créer** |
| Filtre gateway par channel | ❌ Absent | Gateway filtre par `poste_id` uniquement |
| UI d'assignation channel→poste | ❌ Absent | **À créer** |

---

## 3. Architecture cible

```
Webhook reçu (WHAPI / Meta / Instagram / ...)
        │
        ↓ channel_id extrait
UnifiedIngressService.ingest()
        │
        ↓
DispatcherService.assignConversation(chatId, name, traceId, tenantId, channelId)
        │                                                               ↑
        │                                                          NOUVEAU
        ↓
  channel.poste_id IS NOT NULL ?
        │
    OUI ─────────────────────────────────────────────────────────────────┐
        │                                                                 │
        ↓                                                                 ↓
  (MODE DÉDIÉ)                                               AssignerDirectement
  Ignorer la queue globale                                   chat.poste_id = channel.poste_id
  Assigner directement au poste dédié                       Status = ACTIF si poste online
                                                             Status = EN_ATTENTE si offline
    NON
        │
        ↓
  (MODE POOL — comportement actuel)
  QueueService.getNextInQueue()
  chat.poste_id = nextPoste.id

        └──────────────────────────┐
                                   ↓
                    Gateway.sendConversationsToClient(posteId)
                      → findByPosteId(posteId)
                      (déjà correct — les convs ont le bon poste_id)
```

### Pourquoi cette approche est simple et robuste

Le champ `chat.poste_id` est déjà la source de vérité pour le routing. Il suffit de :
1. Ajouter `poste_id` sur l'entité `WhapiChannel`
2. Dans le dispatcher, lire ce champ **avant** d'appeler la queue globale
3. Si défini → assigner directement au poste dédié sans passer par la queue

Le reste du système (gateway, frontend commercial, métriques) fonctionne déjà par `poste_id` → **zéro modification nécessaire sur le frontend commercial**.

---

## 4. Règles métier

| # | Règle | Détail |
|---|-------|--------|
| R1 | Un channel peut être assigné à **zéro ou un** poste | Contrainte : `UNIQUE(channel_id)` sur la colonne `poste_id` |
| R2 | Un poste peut avoir **zéro ou plusieurs** channels | Un poste peut recevoir des conversations de plusieurs channels dédiés |
| R3 | Channel sans poste assigné → **queue globale** | Comportement actuel conservé pour les channels non assignés |
| R4 | Channel assigné → poste dédié **exclusivement** | Même si la queue globale est vide et le poste offline, le message n'est pas redirigé ailleurs |
| R5 | Si le poste dédié est **offline** | Le chat est créé en status `EN_ATTENTE` avec `poste_id = dédié` — le cron SLA peut le gérer |
| R6 | Désassigner un channel | `poste_id = null` → retour en mode pool (queue globale) |
| R7 | Les conversations **existantes** ne sont pas migrées | Le changement d'assignation ne rétroagit pas sur les chats déjà créés |
| R8 | L'admin voit le poste assigné de chaque channel | Affiché dans `ChannelsView` |
| R9 | Un agent voit **seulement** les conversations de son poste | Règle déjà en place — non modifiée |

---

## 5. Implémentation — Backend

### 5.1 Migration BDD

```sql
-- Ajouter la colonne poste_id sur le channel
ALTER TABLE whapi_channels
  ADD COLUMN poste_id CHAR(36) DEFAULT NULL,
  ADD CONSTRAINT fk_channel_poste
    FOREIGN KEY (poste_id) REFERENCES whatsapp_poste(id)
    ON DELETE SET NULL;

-- Index pour les lookups fréquents (dispatcher lit souvent ce champ)
CREATE INDEX idx_channel_poste ON whapi_channels(poste_id);
```

> **Note** : `ON DELETE SET NULL` garantit que si un poste est supprimé, le channel repasse automatiquement en mode pool (queue globale). Aucune conversation orpheline.

---

### 5.2 Entité WhapiChannel

**Fichier** : `message_whatsapp/src/channel/entities/channel.entity.ts`

```typescript
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';

@Entity('whapi_channels')
export class WhapiChannel {
  // ... champs existants ...

  /**
   * Poste dédié à ce channel.
   * NULL = mode pool (queue globale).
   * NOT NULL = toutes les conversations de ce channel vont EXCLUSIVEMENT à ce poste.
   */
  @Column({ name: 'poste_id', nullable: true, type: 'char', length: 36 })
  poste_id: string | null;

  @ManyToOne(() => WhatsappPoste, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'poste_id', referencedColumnName: 'id' })
  poste?: WhatsappPoste | null;
}
```

---

### 5.3 DTO

**Fichier** : `message_whatsapp/src/channel/dto/assign-poste.dto.ts` (nouveau)

```typescript
import { IsUUID, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignPosteDto {
  @ApiPropertyOptional({
    description: 'UUID du poste à assigner à ce channel. null = retour en mode pool.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  poste_id: string | null;
}
```

---

### 5.4 ChannelService

**Fichier** : `message_whatsapp/src/channel/channel.service.ts`

Ajouter deux méthodes :

```typescript
/**
 * Assigne (ou désassigne) un poste à un channel.
 * poste_id = null → retour en mode pool (queue globale).
 */
async assignPoste(channelId: string, posteId: string | null): Promise<WhapiChannel> {
  if (posteId !== null) {
    // Vérifier que le poste existe
    const poste = await this.posteRepository.findOne({ where: { id: posteId } });
    if (!poste) {
      throw new NotFoundException(`Poste introuvable : ${posteId}`);
    }
  }

  await this.channelRepository.update(
    { channel_id: channelId },
    { poste_id: posteId },
  );

  this.logger.log(
    posteId
      ? `Channel "${channelId}" assigné au poste "${posteId}"`
      : `Channel "${channelId}" désassigné (retour en mode pool)`,
  );

  return this.findOne(channelId);
}

/**
 * Retourne le poste_id dédié à ce channel, ou null si mode pool.
 * Utilisé par le dispatcher à chaque message entrant — doit être rapide.
 */
async getDedicatedPosteId(channelId: string): Promise<string | null> {
  const result = await this.channelRepository
    .createQueryBuilder('c')
    .select('c.poste_id')
    .where('c.channel_id = :channelId', { channelId })
    .getRawOne<{ c_poste_id: string | null }>();
  return result?.c_poste_id ?? null;
}
```

---

### 5.5 ChannelController — endpoint d'assignation

**Fichier** : `message_whatsapp/src/channel/channel.controller.ts`

```typescript
@Patch(':channelId/assign-poste')
@UseGuards(AdminGuard)
@ApiOperation({ summary: 'Assigne ou désassigne un poste à un channel' })
@ApiResponse({ status: 200, description: 'Channel mis à jour' })
async assignPoste(
  @Param('channelId') channelId: string,
  @Body() dto: AssignPosteDto,
): Promise<WhapiChannel> {
  return this.channelService.assignPoste(channelId, dto.poste_id);
}
```

**Route** : `PATCH /api/channels/:channelId/assign-poste`
**Guard** : `AdminGuard` (réservé à l'admin)
**Body** : `{ "poste_id": "uuid" }` ou `{ "poste_id": null }`

---

### 5.6 Dispatcher — routage par channel

**Fichier** : `message_whatsapp/src/dispatcher/dispatcher.service.ts`

**Modification de la signature** : ajouter `channelId` en paramètre.

```typescript
async assignConversation(
  chatId: string,
  clientName: string,
  traceId: string,
  tenantId: string,
  channelId: string,          // ← NOUVEAU paramètre
): Promise<WhatsappChat> {

  // ─── NOUVEAU : vérifier si ce channel a un poste dédié ──────────────
  const dedicatedPosteId = await this.channelService.getDedicatedPosteId(channelId);
  // ────────────────────────────────────────────────────────────────────

  const existingChat = await this.chatRepository.findOne({
    where: { chat_id: chatId },
    relations: ['poste'],
  });

  if (existingChat) {
    // Conversation existante
    if (existingChat.poste && existingChat.poste.is_active) {
      // Agent déjà connecté → incrémenter seulement
      await this.chatRepository.update(existingChat.id, {
        last_activity_at: new Date(),
      });
      await this.chatService.incrementUnreadCount(chatId);
      return existingChat;
    }

    // ─── NOUVEAU : réassignation avec priorité au poste dédié ─────────
    return this.reassignConversation(existingChat, dedicatedPosteId);
    // ────────────────────────────────────────────────────────────────────
  }

  // Nouvelle conversation
  return this.createAndAssignConversation(
    chatId,
    clientName,
    tenantId,
    channelId,
    dedicatedPosteId,   // ← NOUVEAU
  );
}

/**
 * Réassigne une conversation existante.
 * Priorité : poste dédié > queue globale > EN_ATTENTE.
 */
private async reassignConversation(
  chat: WhatsappChat,
  dedicatedPosteId: string | null,
): Promise<WhatsappChat> {

  // Résoudre le prochain poste : dédié ou queue globale
  const nextPoste = await this.resolveNextPoste(dedicatedPosteId);

  if (!nextPoste) {
    // Aucun poste disponible → EN_ATTENTE avec le poste dédié si défini
    await this.chatRepository.update(chat.id, {
      poste_id: dedicatedPosteId ?? null,
      status: WhatsappChatStatus.EN_ATTENTE,
    });
    this.logger.warn(
      `Aucun poste disponible pour conversation "${chat.chat_id}"` +
      (dedicatedPosteId ? ` (channel dédié à ${dedicatedPosteId})` : ' (pool global)'),
    );
    return chat;
  }

  await this.chatRepository.update(chat.id, {
    poste_id: nextPoste.id,
    poste: nextPoste,
    status: nextPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
    assigned_at: new Date(),
    assigned_mode: nextPoste.is_active ? 'ONLINE' : 'OFFLINE',
    first_response_deadline_at: new Date(Date.now() + 5 * 60 * 1000),
  });

  return { ...chat, poste: nextPoste, poste_id: nextPoste.id };
}

/**
 * Résout le prochain poste selon la priorité :
 * 1. Poste dédié (si défini et actif)
 * 2. Queue globale (si pas de poste dédié)
 * Retourne null si aucun poste disponible.
 */
private async resolveNextPoste(dedicatedPosteId: string | null): Promise<WhatsappPoste | null> {
  if (dedicatedPosteId) {
    // MODE DÉDIÉ — utiliser uniquement ce poste
    const poste = await this.posteRepository.findOne({
      where: { id: dedicatedPosteId },
    });
    if (!poste) {
      this.logger.error(`Poste dédié "${dedicatedPosteId}" introuvable — fallback sur pool global`);
      // Sécurité : si le poste dédié est supprimé (ne devrait pas arriver grâce à ON DELETE SET NULL)
      return this.queueService.getNextInQueue();
    }
    // Retourner le poste dédié même s'il est offline (→ le chat sera EN_ATTENTE)
    return poste;
  }

  // MODE POOL — queue globale (comportement actuel)
  return this.queueService.getNextInQueue();
}
```

**Transmettre `channelId` depuis `InboundMessageService`** :

Fichier : `message_whatsapp/src/webhooks/inbound-message.service.ts`

```typescript
// Modifier l'appel existant :
const conversation = await this.dispatcherService.assignConversation(
  message.chatId,
  message.fromName ?? 'Client',
  traceId,
  message.tenantId,
  message.channelId,  // ← AJOUTER
);
```

---

### 5.7 QueueService — getNextInQueueForPoste

La méthode `getNextInQueue()` existante est conservée telle quelle pour le mode pool.

Aucune modification nécessaire sur `QueueService` — le dispatcher lit directement le poste dédié via `channelService.getDedicatedPosteId()`.

---

### 5.8 Gateway WebSocket — isolation des conversations

**Fichier** : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**Bonne nouvelle** : la gateway filtre déjà par `poste_id` :

```typescript
let chats = await this.chatService.findByPosteId(agent.posteId, []);
```

Puisque le dispatcher assigne correctement `chat.poste_id = channel.poste_id` pour les channels dédiés, **la gateway n'a pas besoin d'être modifiée**.

Un agent du poste A verra automatiquement :
- Toutes les conversations assignées à son poste (via `poste_id = A`)
- Qu'elles viennent d'un channel dédié à son poste ou d'un channel pool

Un agent du poste B ne verra **jamais** les conversations du channel dédié au poste A — elles ont `poste_id = A`.

> ✅ L'isolation est garantie par la logique existante. Aucune modification du gateway.

---

## 6. Implémentation — Admin Frontend

### 6.1 ChannelsView — sélecteur de poste

**Fichier** : `admin/src/app/ui/ChannelsView.tsx`

#### Affichage dans le tableau des canaux

Ajouter une colonne "Poste dédié" dans le tableau :

```tsx
// Colonne à ajouter dans le tableau des channels
<th>Poste dédié</th>

// Cellule correspondante
<td>
  {channel.poste ? (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
      🏢 {channel.poste.name}
      <button
        onClick={() => handleUnassign(channel.channel_id)}
        className="ml-1 text-blue-400 hover:text-red-500"
        title="Retirer l'assignation"
      >
        ✕
      </button>
    </span>
  ) : (
    <span className="text-gray-400 text-xs italic">Pool global</span>
  )}
</td>
```

#### Modal / dropdown d'assignation

Ajouter un bouton "Assigner un poste" dans la ligne de chaque channel ou dans le formulaire d'édition du channel :

```tsx
function ChannelPosteSelector({ channel, postes, onAssign }: {
  channel: Channel;
  postes: Poste[];
  onAssign: (channelId: string, posteId: string | null) => void;
}) {
  const [selected, setSelected] = useState<string>(channel.poste_id ?? '');

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        Poste dédié
      </label>
      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        className="w-full border rounded px-3 py-2 text-sm"
      >
        <option value="">— Pool global (aucun poste dédié) —</option>
        {postes.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} {!p.is_active ? '(inactif)' : ''}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        {selected
          ? `Tous les messages de ce canal iront exclusivement au poste sélectionné.`
          : `Les messages de ce canal seront distribués via la queue globale.`}
      </p>
      <button
        onClick={() => onAssign(channel.channel_id, selected || null)}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
      >
        Enregistrer
      </button>
    </div>
  );
}
```

#### Handler d'assignation

```tsx
const handleAssignPoste = async (channelId: string, posteId: string | null) => {
  try {
    await api.assignChannelToPoste(channelId, posteId);
    toast.success(
      posteId
        ? 'Channel assigné au poste avec succès'
        : 'Channel retourné en mode pool global'
    );
    refreshChannels();
  } catch (err) {
    toast.error('Erreur lors de l\'assignation');
  }
};
```

#### Indicateur visuel dans la liste des channels

```tsx
// Badge visible dans la liste pour identifier rapidement les channels dédiés
{channel.poste_id ? (
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-blue-500" title="Channel dédié" />
    <span className="text-xs text-blue-600 font-medium">{channel.poste?.name}</span>
  </div>
) : (
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-gray-300" title="Pool global" />
    <span className="text-xs text-gray-400">Pool global</span>
  </div>
)}
```

---

### 6.2 PostesView — canaux assignés

**Fichier** : `admin/src/app/ui/PostesView.tsx`

Dans le détail ou la card de chaque poste, afficher les channels qui lui sont dédiés :

```tsx
// Dans la fiche d'un poste
<div className="mt-3">
  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
    Canaux dédiés
  </p>
  {poste.channels?.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {poste.channels.map(c => (
        <span
          key={c.channel_id}
          className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700"
        >
          <ChannelProviderIcon provider={c.provider} />
          {c.label ?? c.channel_id}
        </span>
      ))}
    </div>
  ) : (
    <p className="text-xs text-gray-400 italic">
      Aucun canal dédié — reçoit les messages via la queue globale
    </p>
  )}
</div>
```

Pour charger cette donnée, ajouter la relation dans l'endpoint des postes :

**Fichier** : `message_whatsapp/src/whatsapp_poste/whatsapp_poste.service.ts`

```typescript
async findAll(): Promise<WhatsappPoste[]> {
  return this.posteRepository.find({
    relations: ['channels'],  // ← AJOUTER la relation
    order: { name: 'ASC' },
  });
}
```

**Fichier** : `message_whatsapp/src/whatsapp_poste/entities/whatsapp_poste.entity.ts`

```typescript
// Ajouter la relation inverse
@OneToMany(() => WhapiChannel, (channel) => channel.poste)
channels: WhapiChannel[];
```

---

### 6.3 API admin

**Fichier** : `admin/src/app/lib/api.ts`

```typescript
/**
 * Assigne ou désassigne un poste à un channel.
 * @param channelId - channel_id du canal (ex: phone_number_id Meta)
 * @param posteId   - UUID du poste, ou null pour retour en pool global
 */
export async function assignChannelToPoste(
  channelId: string,
  posteId: string | null,
): Promise<Channel> {
  const res = await fetch(
    `${API_BASE}/channels/${encodeURIComponent(channelId)}/assign-poste`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: JSON.stringify({ poste_id: posteId }),
    },
  );
  if (!res.ok) throw new Error(`Assignation échouée : ${res.status}`);
  return res.json();
}
```

---

## 7. Cas limites et comportements attendus

### CL-1 · Le poste dédié est offline au moment du message

```
channel.poste_id = "poste-A"
poste-A.is_active = false

→ chat.poste_id = "poste-A"
→ chat.status = EN_ATTENTE
→ Le cron SLA (read-only-enforcement) gère la suite
→ Quand poste-A repasse online, il voit la conversation en attente
→ La conversation ne va PAS dans un autre poste
```

**Pourquoi** : Règle R4. Le channel dédié est une règle d'exclusivité forte. Si l'intention est de router vers "Support VIP", mettre la conversation en attente est correct plutôt que de la router vers le "Support Généraliste".

---

### CL-2 · Le poste dédié est supprimé

```sql
DELETE FROM whatsapp_poste WHERE id = 'poste-A';
-- Cascade : whapi_channels.poste_id SET NULL (ON DELETE SET NULL)
```

→ Le channel repasse automatiquement en mode pool global.  
→ Les conversations existantes `chat.poste_id = 'poste-A'` sont déjà orphelines (géré par le cron `offline-reinject`).

---

### CL-3 · Le channel est réassigné à un autre poste en cours d'exploitation

```
Avant : channel.poste_id = "poste-A"
Admin change → channel.poste_id = "poste-B"

→ Les conversations EXISTANTES gardent poste_id = "poste-A" (Règle R7)
→ Les NOUVEAUX messages vont vers "poste-B"
→ Le poste A continue de voir et gérer ses conversations en cours
```

Si l'admin veut migrer les conversations existantes, c'est une action manuelle séparée (hors scope de cette fonctionnalité).

---

### CL-4 · Un nouveau message arrive sur une conversation existante dont le channel a changé de poste dédié

```
Conversation créée quand channel → poste-A (chat.poste_id = A)
Admin réassigne channel → poste-B
Client envoie un nouveau message

→ Le dispatcher trouve l'existingChat (poste_id = A, poste-A still actif)
→ Si poste-A est actif : incrémenter seulement, pas de réassignation (comportement normal)
→ Si poste-A est offline : réassigner selon le channel actuel → poste-B
```

---

### CL-5 · Channel en pool global, aucun poste disponible dans la queue

```
channel.poste_id = null  (mode pool)
queue vide (tous les postes offline ou désactivés)

→ chat.poste_id = null
→ chat.status = EN_ATTENTE
→ Le cron offline-reinject réinjecte quand un poste repasse online
```

Comportement identique à l'actuel. Pas de changement.

---

### CL-6 · Channel dédié, poste_id valide mais poste.is_queue_enabled = false

```
channel.poste_id = "poste-A"
poste-A.is_queue_enabled = false

→ Le poste dédié est utilisé quand même (l'assignation directe ignore is_queue_enabled)
→ is_queue_enabled ne s'applique qu'à la queue globale (mode pool)
→ chat.poste_id = "poste-A"
```

**Justification** : `is_queue_enabled` contrôle si le poste peut recevoir des messages via la **queue** (distribution automatique du pool global). L'assignation dédiée est une règle admin explicite qui prend le dessus.

---

## 8. Tests à implémenter

### Tests unitaires — DispatcherService

```typescript
describe('DispatcherService.assignConversation avec channel dédié', () => {

  it('CH-01 : canal dédié actif → conversation assignée directement au poste dédié', async () => {
    channelService.getDedicatedPosteId.mockResolvedValue('poste-A');
    posteRepository.findOne.mockResolvedValue({ id: 'poste-A', is_active: true });

    const result = await dispatcher.assignConversation(
      'chat-123', 'Ahmed', 'trace-1', 'tenant-1', 'channel-1'
    );

    expect(result.poste_id).toBe('poste-A');
    expect(result.status).toBe(WhatsappChatStatus.ACTIF);
    expect(queueService.getNextInQueue).not.toHaveBeenCalled();  // queue non utilisée
  });

  it('CH-02 : canal dédié offline → EN_ATTENTE sur le poste dédié', async () => {
    channelService.getDedicatedPosteId.mockResolvedValue('poste-A');
    posteRepository.findOne.mockResolvedValue({ id: 'poste-A', is_active: false });

    const result = await dispatcher.assignConversation(
      'chat-123', 'Ahmed', 'trace-1', 'tenant-1', 'channel-1'
    );

    expect(result.poste_id).toBe('poste-A');
    expect(result.status).toBe(WhatsappChatStatus.EN_ATTENTE);
    expect(queueService.getNextInQueue).not.toHaveBeenCalled();  // queue non utilisée
  });

  it('CH-03 : canal sans poste dédié → comportement actuel (queue globale)', async () => {
    channelService.getDedicatedPosteId.mockResolvedValue(null);
    queueService.getNextInQueue.mockResolvedValue({ id: 'poste-B', is_active: true });

    const result = await dispatcher.assignConversation(
      'chat-456', 'Mohamed', 'trace-2', 'tenant-1', 'channel-2'
    );

    expect(queueService.getNextInQueue).toHaveBeenCalledTimes(1);
    expect(result.poste_id).toBe('poste-B');
  });

  it('CH-04 : canal dédié, poste_id non trouvé en DB → fallback queue globale', async () => {
    channelService.getDedicatedPosteId.mockResolvedValue('poste-inconnu');
    posteRepository.findOne.mockResolvedValue(null);  // poste supprimé
    queueService.getNextInQueue.mockResolvedValue({ id: 'poste-C', is_active: true });

    const result = await dispatcher.assignConversation(
      'chat-789', 'Sara', 'trace-3', 'tenant-1', 'channel-3'
    );

    expect(queueService.getNextInQueue).toHaveBeenCalledTimes(1);
    expect(result.poste_id).toBe('poste-C');
  });

  it('CH-05 : canal dédié, conversation existante sur poste actif → incrément sans réassignation', async () => {
    const existingChat = { chat_id: 'chat-123', poste_id: 'poste-A', poste: { is_active: true } };
    chatRepository.findOne.mockResolvedValue(existingChat);
    channelService.getDedicatedPosteId.mockResolvedValue('poste-A');

    await dispatcher.assignConversation(
      'chat-123', 'Ahmed', 'trace-1', 'tenant-1', 'channel-1'
    );

    expect(chatRepository.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ last_activity_at: expect.any(Date) }),
    );
    // Pas de changement de poste_id
    expect(chatRepository.update).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ poste_id: expect.anything() }),
    );
  });
});
```

### Tests unitaires — ChannelService

```typescript
describe('ChannelService.assignPoste', () => {

  it('AS-01 : assignation valide → poste_id mis à jour', async () => {
    posteRepository.findOne.mockResolvedValue({ id: 'poste-A' });
    await channelService.assignPoste('channel-1', 'poste-A');
    expect(channelRepository.update).toHaveBeenCalledWith(
      { channel_id: 'channel-1' },
      { poste_id: 'poste-A' },
    );
  });

  it('AS-02 : désassignation (null) → poste_id = null', async () => {
    await channelService.assignPoste('channel-1', null);
    expect(channelRepository.update).toHaveBeenCalledWith(
      { channel_id: 'channel-1' },
      { poste_id: null },
    );
  });

  it('AS-03 : poste inexistant → NotFoundException', async () => {
    posteRepository.findOne.mockResolvedValue(null);
    await expect(channelService.assignPoste('channel-1', 'poste-inconnu'))
      .rejects.toThrow(NotFoundException);
  });
});
```

### Test E2E — Flux complet

```typescript
describe('E2E : Channel dédié → isolation des conversations', () => {

  it('E2E-01 : message sur channel dédié à poste-A → visible uniquement par poste-A', async () => {
    // Setup : channel-1 assigné à poste-A
    await channelService.assignPoste('channel-1', 'poste-A');

    // Simuler un message entrant
    await inboundMessageService.processMessage({
      chatId: 'client-phone@s.whatsapp.net',
      channelId: 'channel-1',
      tenantId: 'tenant-1',
      text: 'Bonjour',
      fromName: 'Client Test',
    });

    // Vérifier que le chat est assigné à poste-A
    const chat = await chatRepository.findOne({ where: { chat_id: 'client-phone@s.whatsapp.net' } });
    expect(chat.poste_id).toBe('poste-A');

    // Vérifier que poste-B ne voit pas ce chat
    const chatsPosteB = await chatService.findByPosteId('poste-B', []);
    expect(chatsPosteB.find(c => c.chat_id === chat.chat_id)).toBeUndefined();
  });
});
```

---

## 9. Ordre d'implémentation

```
Étape 1 — Migration et entité (0,5j)
  ├── Migration SQL : ALTER TABLE whapi_channels ADD COLUMN poste_id
  ├── Mettre à jour WhapiChannel entity (champ + relation)
  └── Mettre à jour WhatsappPoste entity (relation inverse channels)

Étape 2 — Service et endpoint backend (0,5j)
  ├── ChannelService.assignPoste()
  ├── ChannelService.getDedicatedPosteId()
  └── PATCH /api/channels/:channelId/assign-poste

Étape 3 — Dispatcher (1j)
  ├── Ajouter channelId dans la signature assignConversation()
  ├── Transmettre channelId depuis InboundMessageService
  ├── Implémenter resolveNextPoste() avec priorité dédié > pool
  └── Implémenter reassignConversation() mis à jour

Étape 4 — Admin Frontend (1j)
  ├── ChannelsView : colonne "Poste dédié" + dropdown d'assignation
  ├── PostesView : liste des channels dédiés dans la fiche du poste
  └── api.ts : fonction assignChannelToPoste()

Étape 5 — Tests (1j)
  ├── Tests unitaires DispatcherService (CH-01 à CH-05)
  ├── Tests unitaires ChannelService (AS-01 à AS-03)
  └── Test E2E flux complet (E2E-01)

─────────────────────────────────────
  TOTAL : ~4 jours
─────────────────────────────────────
```

### Résumé des fichiers modifiés

| Fichier | Type de modification |
|---------|---------------------|
| `message_whatsapp/src/channel/entities/channel.entity.ts` | Ajouter `poste_id` + relation `ManyToOne` |
| `message_whatsapp/src/whatsapp_poste/entities/whatsapp_poste.entity.ts` | Ajouter relation `OneToMany → channels` |
| `message_whatsapp/src/channel/dto/assign-poste.dto.ts` | **NOUVEAU** |
| `message_whatsapp/src/channel/channel.service.ts` | Ajouter `assignPoste()` + `getDedicatedPosteId()` |
| `message_whatsapp/src/channel/channel.controller.ts` | Ajouter `PATCH /:channelId/assign-poste` |
| `message_whatsapp/src/dispatcher/dispatcher.service.ts` | Ajouter `channelId` en paramètre + logique dédiée |
| `message_whatsapp/src/webhooks/inbound-message.service.ts` | Transmettre `channelId` au dispatcher |
| `message_whatsapp/src/whatsapp_poste/whatsapp_poste.service.ts` | Charger la relation `channels` dans `findAll()` |
| `admin/src/app/ui/ChannelsView.tsx` | Colonne + dropdown d'assignation |
| `admin/src/app/ui/PostesView.tsx` | Afficher les channels dédiés |
| `admin/src/app/lib/api.ts` | Ajouter `assignChannelToPoste()` |
| Migration SQL | `ALTER TABLE whapi_channels ADD COLUMN poste_id` |

### Fichiers **non modifiés**

| Fichier | Raison |
|---------|--------|
| `whatsapp_message.gateway.ts` | Filtre déjà par `poste_id` — aucun changement nécessaire |
| `front/src/store/chatStore.ts` | Frontend commercial inchangé |
| `front/src/**` | Aucune modification côté agent commercial |
| `QueueService` | Queue globale conservée telle quelle |
| `whatsapp_chat.entity.ts` | Aucun champ supplémentaire nécessaire |

---

*Document rédigé le 2026-04-03.
Sources analysées : `channel.entity.ts`, `whatsapp_poste.entity.ts`, `whatsapp_chat.entity.ts`, `dispatcher.service.ts`, `inbound-message.service.ts`, `whatsapp_message.gateway.ts`, `ChannelsView.tsx`, `PostesView.tsx`.*
