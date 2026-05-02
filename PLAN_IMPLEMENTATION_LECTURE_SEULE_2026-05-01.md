# Plan d'implémentation — Lecture seule paramétrable
> Date : 2026-05-01 | Branche : `production`

---

## Architecture cible

**Système hybride : paramètre global + override par canal + compteur sur conversation**

```
resolveReadOnlyLimit(channelId) :
  1. canal.no_read_only = true                → 0 (jamais bloqué — priorité absolue)
  2. canal.read_only_after_messages != null   → cette valeur (override canal)
  3. sinon                                    → dispatch_settings.read_only_max_messages (global)

Règle d'application :
  limit = 0 → pas de lecture seule
  limit > 0 → lecture seule après `limit` messages commerciaux sans réponse client
```

**Valeurs possibles :**
- `0` = désactivé (commercial peut écrire sans limite)
- `1` = comportement actuel (lecture seule après 1 message — défaut)
- `N` = lecture seule après N messages commerciaux

---

## EPIC 1 — Migration BDD

**Complexité : Faible** | Dépendances : aucune

### US 1.1 — Créer la migration `ReadOnlyConfig1746144000008`

**Fichier à créer :** `message_whatsapp/src/database/migrations/ReadOnlyConfig1746144000008.ts`

Colonnes à ajouter :

| Table | Colonne | Type | Défaut |
|---|---|---|---|
| `whapi_channels` | `read_only_after_messages` | INT NULL | NULL |
| `whatsapp_chat` | `poste_message_count_since_last_client` | INT NOT NULL | 0 |
| `dispatch_settings` | `read_only_max_messages` | INT NOT NULL | 1 |

> Timestamp `1746144000008` = 2026-05-02 00:00:00 UTC

### US 1.2 — Mettre à jour les entités TypeORM

**Fichier à modifier :** `message_whatsapp/src/whatsapp_message/entities/whatsapp_chat.entity.ts`
- Ajouter `posteMessageCountSinceLastClient: number` (default 0, name: `poste_message_count_since_last_client`)

**Fichier à modifier :** `message_whatsapp/src/whapi/entities/channel.entity.ts`
- Ajouter `readOnlyAfterMessages: number | null` (nullable, name: `read_only_after_messages`)

**Fichier à modifier :** `message_whatsapp/src/dispatch-settings/entities/dispatch-settings.entity.ts`
- Ajouter `readOnlyMaxMessages: number` (default 1, name: `read_only_max_messages`)

---

## EPIC 2 — Backend : service `resolveReadOnlyLimit()`

**Complexité : Faible** | Dépendances : EPIC 1

### US 2.1 — Ajouter `resolveReadOnlyLimit()` dans `ChannelService`

**Fichier à modifier :** `message_whatsapp/src/whapi/channel.service.ts`

```typescript
async resolveReadOnlyLimit(channelId: string): Promise<number> {
  const channel = await this.channelRepository.findOne({ where: { channel_id: channelId } });
  if (!channel) return 1;
  if (channel.no_read_only) return 0;                                          // priorité absolue
  if (channel.readOnlyAfterMessages !== null) return channel.readOnlyAfterMessages; // override canal
  const settings = await this.dispatchSettingsService.get();
  return settings.readOnlyMaxMessages ?? 1;                                    // global
}
```

---

## EPIC 3 — Backend : logique envoi avec compteur

**Complexité : Moyenne** | Dépendances : EPIC 1, EPIC 2

### US 3.1 — Modifier les 3 méthodes d'envoi dans `whatsapp_message.service.ts`

**Fichier à modifier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

Pour chacune des 3 méthodes (texte ligne ~218, média ligne ~390, localisation ligne ~502) :

**Avant :**
```typescript
if (data.poste_id && !channel.poste_id) {
  await chatRepository.update({ chat_id }, { read_only: true });
}
```

**Après :**
```typescript
if (data.poste_id && !channel.poste_id) {
  const limit = await channelService.resolveReadOnlyLimit(channel.channel_id);
  if (limit > 0) {
    const newCount = (chat.posteMessageCountSinceLastClient ?? 0) + 1;
    await chatRepository.update({ chat_id }, {
      poste_message_count_since_last_client: newCount,
      read_only: newCount >= limit,
    });
  }
}
```

### US 3.2 — Aligner la Gateway WebSocket

**Fichier à modifier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` ligne ~900

Remplacer la logique simplifiée par la même logique compteur + limite résolue.
> Centraliser dans le service — la gateway relit la valeur en DB plutôt que recalculer.

### US 3.3 — Réinitialiser le compteur à chaque message client entrant

**Fichier à modifier :** `message_whatsapp/src/inbound-message/inbound-message.service.ts` ligne ~176

Ajouter `poste_message_count_since_last_client: 0` dans le `chatService.update()` qui met déjà `read_only: false`.

---

## EPIC 4 — Backend : DTOs et exposition du paramètre global

**Complexité : Faible** | Dépendances : EPIC 1

### US 4.1 — DTO `DispatchSettings`

**Fichier à modifier :** `message_whatsapp/src/dispatch-settings/dto/update-dispatch-settings.dto.ts`
```typescript
@IsInt()
@Min(0)
@Max(100)
@IsOptional()
readOnlyMaxMessages?: number;
```

### US 4.2 — DTO `Channel`

**Fichier à modifier :** `message_whatsapp/src/whapi/dto/update-channel.dto.ts`
```typescript
@IsInt()
@Min(0)
@IsOptional()
readOnlyAfterMessages?: number | null;
```

---

## EPIC 5 — Admin UI

**Complexité : Faible** | Dépendances : EPIC 4

### US 5.1 — Paramètre global dans `DispatchView.tsx`

**Fichier à modifier :** `admin/src/app/ui/DispatchView.tsx`

- Champ numérique "Nombre de messages autorisés avant lecture seule"
- Label explicite : "0 = désactivé / 1 = comportement actuel / N = N messages"
- Input number, min=0, max=100, défaut=1
- PATCH vers `/api/dispatch-settings`

### US 5.2 — Override par canal dans `ChannelsView.tsx`

**Fichier à modifier :** `admin/src/app/ui/ChannelsView.tsx`

Dans la modal de canal existante :
- Champ "Override limite messages" : vide (NULL) = suivre le global, sinon valeur numérique
- Input number nullable, min=0
- PATCH vers `/api/channels/:id`

### US 5.3 — Types frontend admin

**Fichier à modifier :** `admin/src/app/lib/definitions.ts`
- Ajouter `readOnlyAfterMessages?: number | null` dans le type `Channel`
- Ajouter `readOnlyMaxMessages?: number` dans le type `DispatchSettings`

---

## EPIC 6 — Frontend commercial (vérification)

**Complexité : Très faible** | Dépendances : EPIC 3

### US 6.1 — Vérifier sans modifier

**Fichiers à vérifier :**
- `front/src/components/WebSocketEvents.tsx` ligne 170 — écoute `CONVERSATION_READONLY`
- `front/src/components/ChatMainArea.tsx` ligne 65 — `disabled={!!selectedConversation?.readonly}`
- `front/src/components/ChatInput.tsx` — `disabled` sur textarea et boutons
- `front/src/types/chat.ts` ligne 786 — mapping `raw.read_only → readonly`

> Aucune modification nécessaire si le signal WebSocket `CONVERSATION_READONLY` est conservé. Vérifier uniquement l'absence de cas edge avec le compteur.

---

## Ordre d'exécution

```
Sprint A — BDD + entités (parallélisable) :
  ├─ US 1.1 : Migration ReadOnlyConfig1746144000008
  └─ US 1.2 : Entités TypeORM (chat + channel + dispatch-settings)

Sprint B — Backend logique (dépend Sprint A) :
  ├─ US 2.1 : resolveReadOnlyLimit() dans ChannelService
  ├─ US 3.1 : Logique compteur dans 3 méthodes d'envoi
  ├─ US 3.2 : Gateway WebSocket alignée
  ├─ US 3.3 : Reset compteur à message client entrant
  ├─ US 4.1 : DTO DispatchSettings
  └─ US 4.2 : DTO Channel

Sprint C — Admin UI + vérification frontend (dépend Sprint B) :
  ├─ US 5.1 : DispatchView — paramètre global
  ├─ US 5.2 : ChannelsView — override par canal
  ├─ US 5.3 : definitions.ts — types
  └─ US 6.1 : Vérification WebSocketEvents + ChatMainArea
```

---

## Récapitulatif des fichiers

### Fichier à créer (backend)

| Fichier | Rôle |
|---|---|
| `src/database/migrations/ReadOnlyConfig1746144000008.ts` | Migration 3 colonnes |

### Fichiers à modifier (backend)

| Fichier | Changement |
|---|---|
| `src/whatsapp_message/entities/whatsapp_chat.entity.ts` | +`posteMessageCountSinceLastClient` |
| `src/whapi/entities/channel.entity.ts` | +`readOnlyAfterMessages` |
| `src/dispatch-settings/entities/dispatch-settings.entity.ts` | +`readOnlyMaxMessages` |
| `src/whapi/channel.service.ts` | +`resolveReadOnlyLimit()` |
| `src/whatsapp_message/whatsapp_message.service.ts` | Logique compteur dans 3 méthodes |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | Alignement logique compteur |
| `src/inbound-message/inbound-message.service.ts` | Reset compteur à message entrant |
| `src/dispatch-settings/dto/update-dispatch-settings.dto.ts` | +`readOnlyMaxMessages` |
| `src/whapi/dto/update-channel.dto.ts` | +`readOnlyAfterMessages` |

### Fichiers à modifier (frontend admin)

| Fichier | Changement |
|---|---|
| `admin/src/app/lib/definitions.ts` | +2 champs Channel + DispatchSettings |
| `admin/src/app/ui/DispatchView.tsx` | Champ paramètre global |
| `admin/src/app/ui/ChannelsView.tsx` | Champ override par canal |

### Fichiers à vérifier (frontend commercial)

| Fichier | Vérification |
|---|---|
| `front/src/components/WebSocketEvents.tsx` | Écoute `CONVERSATION_READONLY` ligne 170 |
| `front/src/components/ChatMainArea.tsx` | `disabled` ligne 65 |
| `front/src/components/ChatInput.tsx` | `disabled` textarea + boutons |
| `front/src/types/chat.ts` | Mapping `raw.read_only → readonly` ligne 786 |

---

## Points d'attention / Risques

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | `no_read_only` existant doit rester prioritaire | Régressions canaux dédiés | `resolveReadOnlyLimit()` l'évalue en premier — retourne 0 immédiatement |
| R2 | Compteur à 0 au déploiement | Comportement identique à aujourd'hui (limit=1, count=0 → 1er message bloque) | Acceptable — aucune régression |
| R3 | Logique dupliquée service + gateway | Incohérence possible | Centraliser dans le service, gateway relit la DB |
| R4 | Auto-message pose `read_only=true` indépendamment du compteur | Comportement voulu | Ne pas toucher `auto-message-orchestrator.service.ts` |
| R5 | Canaux dédiés (`channel.poste_id != null`) jamais affectés | Comportement voulu | Conserver la condition `!channel.poste_id` en amont |
| R6 | `read_only_max_messages = 0` doit désactiver globalement | Risque de mauvaise interprétation | Libellé explicite dans l'UI : "0 = désactivé" |
