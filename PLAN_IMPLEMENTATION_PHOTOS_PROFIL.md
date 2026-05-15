# Plan d'implémentation — Photos de profil WhatsApp & Messenger

**Date :** 2026-05-14  
**Priorité :** P1  
**Périmètre :** Backend NestJS + Frontend React + Admin Next.js

---

## 1. Diagnostic

### Ce qui existe déjà

| Élément | État |
|---|---|
| Champs `chat_pic` / `chat_pic_full` sur `WhatsappChat` | ✅ VARCHAR(100), default `'default.png'` |
| Types TypeScript `chat_pic` / `chat_pic_full` côté admin | ✅ présent dans `definitions.ts` |
| Service de résolution du nom Messenger via Graph API | ✅ `CommunicationMessengerService.getUserName()` |
| `ProviderEnrichmentService` extensible | ✅ point d'extension prévu |

### Ce qui manque

| Élément | Problème |
|---|---|
| Champ `chat_pic` trop petit | VARCHAR(100) insuffisant pour une URL (parfois > 200 chars) |
| Aucun appel Whapi pour la photo | `GET /contacts/{phone}` jamais appelé |
| Aucun appel Messenger pour la photo | Graph API appelée pour le nom, pas pour `profile_pic` |
| `ProviderEnrichmentService` n'enrichit pas la photo | Seul le nom Messenger est résolu |
| Aucune mise à jour de `chat_pic` en BDD | Toujours vide ou `'default.png'` |
| Frontend affiche une icône `User` générique | `chat_pic` jamais utilisé dans `ConversationItem` ni `ChatHeader` |

### Comportement des APIs

**Whapi** — endpoint disponible :
```
GET https://gate.whapi.cloud/contacts/{phone}
Authorization: Bearer {channel.token}
→ Réponse : { picture: "https://...", picture_thumb: "https://..." }
```
- `{phone}` = numéro au format `212600000000` (sans `@s.whatsapp.net`)
- L'URL peut être temporaire (expire sous 30–60 min côté WhatsApp) → **proxy ou rafraîchissement nécessaire**
- Retourne `null` si la photo est privée ou le contact inconnu

**Messenger (Meta Graph API)** — endpoint disponible :
```
GET https://graph.facebook.com/{version}/{psid}?fields=profile_pic&access_token={token}
→ Réponse : { id: "...", profile_pic: "https://..." }
```
- Nécessite la permission `pages_messaging` (déjà obtenue pour l'envoi/réception)
- L'URL expire sous quelques heures → **proxy ou rafraîchissement nécessaire**

**Meta WhatsApp Business** — limitation connue :
- L'API WhatsApp Business Cloud ne fournit **pas** les photos de profil des contacts via webhook ni endpoint
- Solution : afficher un avatar générique coloré (comportement actuel acceptable)

---

## 2. Architecture de la solution

```
Message entrant
      │
      ▼
[InboundMessageService] pipeline
      │
      ├─ Étape 2 : [ProviderEnrichmentService.enrich()]
      │              ├─ résolution nom Messenger (existant)
      │              └─ résolution photo (NOUVEAU)
      │                    ├─ Whapi  → CommunicationWhapiService.getContactPicture()
      │                    └─ Messenger → CommunicationMessengerService.getUserProfilePic()
      │
      ├─ Étape 4 : [IncomingMessagePersistenceService] — persiste le message
      │
      └─ Étape 6 : [InboundStateUpdateService] — met à jour chat
                      └─ si chat_pic a changé → update chat_pic en BDD

Frontend
  ConversationItem ──► <img src={chat_pic} /> avec fallback icône
  ChatHeader       ──► idem
```

**Stratégie de rafraîchissement :**
- Résoudre la photo une seule fois lors du **premier message** (quand `chat_pic` est vide)
- Rafraîchir si la conversation est relancée après 7 jours (TTL souple, non bloquant)
- Pas de job périodique de masse (évite la surcharge API)

**Gestion de l'expiration des URLs :**
- Les URLs Whapi et Messenger expirent → **le backend proxie les images** via un endpoint dédié
- Le frontend appelle `/contacts/:chatId/avatar` → le backend redirige vers l'URL fraîche
- Alternative simple (P1) : stocker directement l'URL et laisser le navigateur gérer le fallback

---

## 3. Phase 1 — Migration base de données

**Fichier :** `message_whatsapp/src/database/migrations/20260514_chat_pic_url.ts`

```typescript
export class ChatPicUrl1747353600001 implements MigrationInterface {
  name = 'ChatPicUrl1747353600001';

  async up(qr: QueryRunner): Promise<void> {
    // chat_pic passe de VARCHAR(100) à TEXT pour supporter les longues URLs
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic TEXT NULL DEFAULT NULL`);
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic_full TEXT NULL DEFAULT NULL`);

    // Nettoyer les valeurs 'default.png' héritées (les traiter comme null)
    await qr.query(`UPDATE whatsapp_chat SET chat_pic = NULL WHERE chat_pic = 'default.png'`);
    await qr.query(`UPDATE whatsapp_chat SET chat_pic_full = NULL WHERE chat_pic_full = 'default.png'`);

    // Ajouter chat_pic_refreshed_at pour gérer le TTL de rafraîchissement
    const hasCol = await qr.hasColumn('whatsapp_chat', 'chat_pic_refreshed_at');
    if (!hasCol) {
      await qr.query(`ALTER TABLE whatsapp_chat ADD COLUMN chat_pic_refreshed_at DATETIME NULL DEFAULT NULL`);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic VARCHAR(100) NOT NULL DEFAULT 'default.png'`);
    await qr.query(`ALTER TABLE whatsapp_chat MODIFY COLUMN chat_pic_full VARCHAR(100) NOT NULL DEFAULT 'default.png'`);
    await qr.query(`ALTER TABLE whatsapp_chat DROP COLUMN IF EXISTS chat_pic_refreshed_at`);
  }
}
```

**Entité à modifier** `whatsapp_chat.entity.ts` :
```typescript
@Column({ name: 'chat_pic', type: 'text', nullable: true, default: null })
chat_pic: string | null;

@Column({ name: 'chat_pic_full', type: 'text', nullable: true, default: null })
chat_pic_full: string | null;

@Column({ name: 'chat_pic_refreshed_at', type: 'datetime', nullable: true, default: null })
chatPicRefreshedAt: Date | null;
```

---

## 4. Phase 2 — Service Whapi : récupération photo de profil

**Fichier à modifier :** `message_whatsapp/src/communication_whapi/communication_whapi.service.ts`

Ajouter une méthode `getContactPicture()` avec cache en mémoire (1h) :

```typescript
/** Cache photo Whapi : phone → { url, thumbUrl, expiresAt } */
private readonly pictureCache = new Map<string, {
  url: string | null;
  thumbUrl: string | null;
  expiresAt: number;
}>();

/**
 * Récupère la photo de profil d'un contact WhatsApp via Whapi.
 * Retourne null si la photo est privée, inaccessible ou en cas d'erreur.
 * Résultat mis en cache 1h.
 *
 * @param phone  Numéro E.164 sans '+' (ex: "2250700000000")
 * @param token  Token Whapi du canal
 */
async getContactPicture(
  phone: string,
  token: string,
): Promise<{ url: string | null; thumbUrl: string | null }> {
  const cached = this.pictureCache.get(phone);
  if (cached && cached.expiresAt > Date.now()) {
    return { url: cached.url, thumbUrl: cached.thumbUrl };
  }

  try {
    const response = await axios.get<{
      picture?: string | null;
      picture_thumb?: string | null;
    }>(
      `https://gate.whapi.cloud/contacts/${phone}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5_000,
      },
    );
    const url      = response.data?.picture       ?? null;
    const thumbUrl = response.data?.picture_thumb ?? null;

    this.pictureCache.set(phone, { url, thumbUrl, expiresAt: Date.now() + 60 * 60_000 });
    return { url, thumbUrl };
  } catch {
    // Photo privée, contact inconnu ou erreur réseau : ne pas bloquer le pipeline
    this.pictureCache.set(phone, { url: null, thumbUrl: null, expiresAt: Date.now() + 10 * 60_000 });
    return { url: null, thumbUrl: null };
  }
}
```

> **Note :** Le nom exact du champ dans la réponse Whapi (`picture`, `picture_url`, `pic`, etc.) doit être vérifié dans la documentation Whapi ou via un appel test sur un canal réel. Adapter le champ si nécessaire.

---

## 5. Phase 3 — Service Messenger : récupération photo de profil

**Fichier à modifier :** `message_whatsapp/src/communication_whapi/communication_messenger.service.ts`

Étendre le cache existant (`nameCache`) pour inclure la photo, ou créer un cache dédié :

```typescript
/** Cache profil Messenger : psid → { name, pictureUrl, expiresAt } */
private readonly profileCache = new Map<string, {
  name: string | null;
  pictureUrl: string | null;
  expiresAt: number;
}>();

/**
 * Récupère la photo de profil d'un utilisateur Messenger via Graph API.
 * Utilise le même PAT que getUserName().
 * Retourne null en cas d'erreur ou si inaccessible.
 */
async getUserProfilePicture(
  psid: string,
  accessToken: string,
  pageId?: string,
): Promise<string | null> {
  const cached = this.profileCache.get(psid);
  if (cached && cached.expiresAt > Date.now()) return cached.pictureUrl;

  const effectiveToken = pageId
    ? (await this.derivePageAccessToken(pageId, accessToken)) ?? accessToken
    : accessToken;

  try {
    const response = await axios.get<{ profile_pic?: string }>(
      `https://graph.facebook.com/${this.META_API_VERSION}/${psid}`,
      {
        params: { fields: 'profile_pic', access_token: effectiveToken },
        timeout: 5_000,
      },
    );
    const pictureUrl = response.data?.profile_pic ?? null;
    this.profileCache.set(psid, { name: null, pictureUrl, expiresAt: Date.now() + 60 * 60_000 });
    return pictureUrl;
  } catch {
    this.profileCache.set(psid, { name: null, pictureUrl: null, expiresAt: Date.now() + 10 * 60_000 });
    return null;
  }
}
```

> **Permission requise :** `pages_messaging` suffit dans la plupart des cas. Si refus 403, il faudra demander `pages_read_engagement` dans le Meta App Dashboard.

---

## 6. Phase 4 — Enrichissement pipeline entrant

**Fichier à modifier :** `message_whatsapp/src/ingress/domain/provider-enrichment.service.ts`

Étendre `enrich()` pour résoudre la photo **uniquement si `chat_pic` est null/vide** (évite les appels inutiles) :

```typescript
/**
 * Enrichit le message avec des données supplémentaires propres au provider.
 * - Messenger : nom + photo de profil
 * - Whapi     : photo de profil
 */
async enrich(message: UnifiedMessage, currentChatPic?: string | null): Promise<void> {
  const needsPicture = !currentChatPic; // uniquement si photo non encore résolue

  if (message.provider === 'messenger' && message.from && message.channelId) {
    if (!message.fromName) {
      message.fromName = await this.resolveMessengerFromName(message.from, message.channelId);
    }
    if (needsPicture) {
      message.fromProfilePicUrl = await this.resolveMessengerPicture(message.from, message.channelId);
    }
  }

  if (message.provider === 'whapi' && message.from && message.channelId && needsPicture) {
    message.fromProfilePicUrl = await this.resolveWhapiPicture(message.from, message.channelId);
  }
}

private async resolveMessengerPicture(psid: string, channelId: string): Promise<string | undefined> {
  try {
    const channel =
      (await this.channelService.findByChannelId(channelId)) ??
      (await this.channelService.findChannelByExternalId('messenger', channelId));
    if (!channel?.token) return undefined;

    const url = await this.messengerService.getUserProfilePicture(
      psid,
      channel.token,
      channel.external_id ?? undefined,
    );
    return url ?? undefined;
  } catch {
    return undefined;
  }
}

private async resolveWhapiPicture(phone: string, channelId: string): Promise<string | undefined> {
  try {
    const channel = await this.channelService.findByChannelId(channelId);
    if (!channel?.token) return undefined;

    const cleanPhone = phone.split('@')[0]; // retirer "@s.whatsapp.net" si présent
    const { thumbUrl } = await this.whapiService.getContactPicture(cleanPhone, channel.token);
    return thumbUrl ?? undefined;
  } catch {
    return undefined;
  }
}
```

**Ajouter `fromProfilePicUrl` dans `UnifiedMessage`** (`src/webhooks/normalization/unified-message.ts`) :
```typescript
fromProfilePicUrl?: string;
```

**Injecter `CommunicationWhapiService`** dans `ProviderEnrichmentService` (via le module).

---

## 7. Phase 5 — Mise à jour de la conversation en BDD

**Fichier à modifier :** `message_whatsapp/src/ingress/domain/inbound-state-update.service.ts`

Dans `apply()`, persister la photo si elle vient d'être résolue :

```typescript
async apply(
  conversation: WhatsappChat,
  savedMessage: WhatsappMessage,
  chatContext?: ChatContext,
  resolvedPictureUrl?: string | null,  // ← nouveau paramètre
): Promise<void> {
  const clientMessageAt = savedMessage.timestamp ?? new Date();
  const windowExpires = new Date(clientMessageAt.getTime() + 24 * 60 * 60 * 1000);

  const pictureUpdate = resolvedPictureUrl && !conversation.chat_pic
    ? { chat_pic: resolvedPictureUrl, chat_pic_full: resolvedPictureUrl, chatPicRefreshedAt: new Date() }
    : {};

  if (chatContext) {
    await this.contextService.updateChatContext(chatContext.id, {
      readOnly: false,
      lastClientMessageAt: clientMessageAt,
      lastActivityAt: clientMessageAt,
      customerWindowExpiresAt: windowExpires,
    });
  } else {
    await this.chatService.update(conversation.chat_id, {
      read_only: false,
      last_client_message_at: clientMessageAt,
      customerWindowExpiresAt: windowExpires,
      outboundMessageCount: 0,
      ...pictureUpdate,
    });
  }

  conversation.read_only = false;
  conversation.last_client_message_at = clientMessageAt;
  conversation.customerWindowExpiresAt = windowExpires;
  if (resolvedPictureUrl && !conversation.chat_pic) {
    conversation.chat_pic = resolvedPictureUrl;
  }
}
```

**Passer `message.fromProfilePicUrl`** depuis `InboundMessageService` à `stateUpdate.apply()`.

---

## 8. Phase 6 — Frontend React : affichage des photos

### 8.1 Composant avatar réutilisable

**Créer :** `front/src/components/ui/ContactAvatar.tsx`

```tsx
import React, { useState } from 'react';
import { User } from 'lucide-react';

interface ContactAvatarProps {
  src?: string | null;
  name?: string | null;
  provider?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-12 h-12' };
const ICON_SIZES = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-7 h-7' };

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

export function ContactAvatar({ src, name, provider = 'whatsapp', size = 'md' }: ContactAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const colors = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name ?? 'Contact'}
        className={`${SIZES[size]} rounded-full object-cover flex-shrink-0`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Fallback : initiale du nom ou icône générique
  if (name?.trim()) {
    const initial = name.trim()[0].toUpperCase();
    return (
      <div className={`${SIZES[size]} ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
        <span className={`text-sm font-semibold ${colors.text}`}>{initial}</span>
      </div>
    );
  }

  return (
    <div className={`${SIZES[size]} ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
      <User className={`${ICON_SIZES[size]} ${colors.text}`} />
    </div>
  );
}
```

### 8.2 Intégration dans `ConversationItem.tsx`

**Fichier :** `front/src/components/sidebar/ConversationItem.tsx`

Remplacer le bloc avatar générique par `<ContactAvatar>` :

```tsx
import { ContactAvatar } from '../ui/ContactAvatar';

// Avant :
// <div className={`w-12 h-12 ${avatarColor.bg} rounded-full...`}>
//   <User className={`...`} />
// </div>

// Après :
<ContactAvatar
  src={conversation.chat_pic}
  name={conversation.name}
  provider={provider}
  size="lg"
/>
```

Vérifier que `Conversation` (dans `front/src/types/chat.ts`) inclut `chat_pic?: string | null`.

### 8.3 Intégration dans `ChatHeader.tsx`

**Fichier :** `front/src/components/chat/ChatHeader.tsx`

```tsx
import { ContactAvatar } from '../ui/ContactAvatar';

// Remplacer le bloc avatar par :
<ContactAvatar
  src={currentConv.chat_pic}
  name={currentConv.name}
  provider={getProviderFromChatId(currentConv.chat_id)}
  size="md"
/>
```

### 8.4 Type `Conversation` à mettre à jour

**Fichier :** `front/src/types/chat.ts`

```typescript
export interface Conversation {
  // ... champs existants ...
  chat_pic?: string | null;
  chat_pic_full?: string | null;
}
```

---

## 9. Phase 7 — Admin panel : affichage des photos

**Fichier :** `admin/src/app/lib/definitions.ts` — déjà `chat_pic` et `chat_pic_full` présents.

Créer un composant réutilisable similaire dans `admin/src/app/ui/ContactAvatar.tsx` et l'utiliser dans les vues de conversations (`ConversationsView.tsx`, `MessagesView.tsx`).

---

## 10. Endpoint proxy avatar (optionnel mais recommandé)

Pour éviter l'expiration des URLs et les problèmes CORS :

**Créer :** `GET /contacts/:chatId/avatar` dans le contrôleur contacts (backend)

```typescript
@Get(':chatId/avatar')
async getAvatar(@Param('chatId') chatId: string, @Res() res: Response) {
  const chat = await this.chatService.findBychat_id(chatId);
  if (!chat?.chat_pic) return res.redirect('/default-avatar.png');

  // Si URL expirée (> 45 min) → re-fetcher via le service
  const needsRefresh = !chat.chatPicRefreshedAt
    || Date.now() - chat.chatPicRefreshedAt.getTime() > 45 * 60_000;

  if (needsRefresh) {
    // re-résoudre la photo selon le provider
    const freshUrl = await this.avatarService.refresh(chat);
    if (freshUrl) return res.redirect(freshUrl);
  }

  return res.redirect(chat.chat_pic);
}
```

**Alternative plus simple** (P1) : enregistrer directement l'URL dans `chat_pic` et laisser le frontend gérer le fallback via `onError` (déjà prévu dans `ContactAvatar`). Les URLs Meta/Whapi sont valables plusieurs heures, ce qui est acceptable pour une session de travail normale.

---

## 11. Cas limites et gestion d'erreurs

| Cas | Comportement attendu |
|---|---|
| Photo privée WhatsApp | `getContactPicture()` retourne `null` → fallback initiale/icône |
| Token Whapi invalide | Exception catchée → log warn, `null` retourné |
| PSID Messenger sans `profile_pic` | Retourne `null` → fallback initiale/icône |
| URL photo expirée côté navigateur | `onError` dans `ContactAvatar` → bascule sur fallback |
| Meta WhatsApp Business | Pas d'URL → fallback icône colorée (comportement actuel acceptable) |
| Contact sans nom | `ContactAvatar` affiche l'icône générique colorée |
| Rate limit API Whapi | Cache 10 min sur les erreurs → ne ré-essaie pas immédiatement |

---

## 12. Ordre d'exécution recommandé

| Ordre | Tâche | Fichiers | Impact |
|---|---|---|---|
| 1 | **Migration BDD** | `20260514_chat_pic_url.ts` + `whatsapp_chat.entity.ts` | Pré-requis tout |
| 2 | **Service Whapi** photo | `communication_whapi.service.ts` | Backend |
| 3 | **Service Messenger** photo | `communication_messenger.service.ts` | Backend |
| 4 | **UnifiedMessage** champ `fromProfilePicUrl` | `unified-message.ts` | Backend |
| 5 | **ProviderEnrichmentService** extension | `provider-enrichment.service.ts` | Backend |
| 6 | **InboundStateUpdateService** persistance | `inbound-state-update.service.ts` | Backend |
| 7 | **Type `Conversation`** frontend | `front/src/types/chat.ts` | Frontend |
| 8 | **ContactAvatar** composant | `front/src/components/ui/ContactAvatar.tsx` | Frontend |
| 9 | **ConversationItem** intégration | `ConversationItem.tsx` | Frontend |
| 10 | **ChatHeader** intégration | `ChatHeader.tsx` | Frontend |
| 11 | **Admin panel** (optionnel) | `admin/src/app/ui/ContactAvatar.tsx` | Admin |
| 12 | **Endpoint proxy** (optionnel) | Nouveau contrôleur | Backend |

---

## 13. Vérifications avant livraison

- [ ] Migration idempotente testée (`hasColumn` guard)
- [ ] `getContactPicture()` ne bloque pas le pipeline entrant en cas d'erreur
- [ ] `getUserProfilePicture()` ne bloque pas le pipeline entrant en cas d'erreur
- [ ] `ContactAvatar` affiche correctement le fallback si `src` est null ou si l'image échoue à charger
- [ ] La photo n'est récupérée que si `chat_pic` est null (pas d'appel API inutile à chaque message)
- [ ] Le cache en mémoire est borné (éviter les fuites mémoire sur longue durée — envisager `Map` avec taille max ou Redis)
- [ ] Le type `Conversation` côté frontend inclut `chat_pic`
- [ ] Test manuel : envoyer un message depuis un vrai compte WhatsApp/Messenger et vérifier l'affichage

---

## 14. Notes sur les permissions Meta

Pour Messenger, si `GET /{psid}?fields=profile_pic` retourne une erreur `#100` (champ inconnu) ou `#200` (permission refusée) :

1. Vérifier dans le Meta App Dashboard que l'app a les permissions `pages_messaging` et `pages_read_engagement`
2. Si l'app est en mode développement, seuls les testeurs approuvés peuvent voir leur photo
3. En production (app soumise à review), `pages_messaging` permet `profile_pic` pour les utilisateurs ayant initié une conversation

---

*Plan généré automatiquement à partir de l'analyse du code le 2026-05-14.*
