# Plan d'implémentation — Instagram Direct

## Vue d'ensemble

Instagram Direct utilise également la **Meta Graph API**, mais via le produit
**Instagram Messaging** (anciennement Instagram Graph API). La mécanique de webhook
est identique à Messenger (même vérification `x-hub-signature-256`, même structure
`entry/messaging`), avec des spécificités propres à Instagram.

- **Provider string :** `'instagram'`
- **Auth :** Instagram User Token ou System User Token (via Meta Business)
- **external_id :** `instagram_business_account_id` (IGSID du compte pro)
- **Webhook subscription :** `messages` + `messaging_seen` + `messaging_referral`
- **API version :** `https://graph.facebook.com/{version}/me/messages`
  (identique à Messenger, mais avec token Instagram)

---

## Différences clés Instagram vs Messenger

| Aspect | Messenger | Instagram |
|---|---|---|
| Identité expéditeur | PSID (Facebook ID) | IGSID (Instagram-Scoped ID) |
| Compte récepteur | Page Facebook | Compte Instagram Business |
| Token requis | Page Access Token | Instagram User Access Token |
| Entry `.id` | page_id | instagram_business_account_id |
| Stories | Non | Oui (mention, reply) |
| Réactions | Limitées | `message_reactions` |
| Window 24h | Oui | Oui (même règle) |

---

## Prérequis Meta / Instagram

1. Application Meta avec le produit **Instagram** activé
2. Compte Instagram **Business** ou **Creator** connecté à une Page Facebook
3. Permissions OAuth requises :
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
4. Variables d'environnement :
   ```env
   META_APP_ID=...              # déjà présent
   META_APP_SECRET=...          # déjà présent
   META_API_VERSION=v21.0       # déjà présent
   INSTAGRAM_VERIFY_TOKEN=...   # nouveau — token vérification webhook Instagram
   ```

---

## Configuration officielle Meta — Instagram Messaging

### Étape 1 — Créer / configurer l'application Meta

> Si l'app Meta existe déjà (pour Messenger ou WhatsApp), on peut ajouter le produit
> Instagram à la même app. Sinon créer une nouvelle app **Business**.

1. Aller sur **Meta for Developers** → **My Apps** → sélectionner ou créer l'app
2. Dans **Add Products** → trouver **Instagram** → **Set up**

> URL : `developers.facebook.com/apps`

---

### Étape 2 — Connecter un compte Instagram Business

Un compte Instagram **Business** ou **Creator** est obligatoire (pas de compte personnel).

1. S'assurer que le compte Instagram est lié à une **Page Facebook**
   - Instagram → Paramètres → Compte → Lier une Page Facebook
2. Dans le dashboard Meta → **Instagram** → **API Setup with Instagram Login**
   (ou **Basic Display API** selon la version)
3. Cliquer **Add Instagram Testers** → ajouter le compte Instagram Business
4. Sur l'application Instagram → **Paramètres** → **Applications et sites web** →
   **Invitations de testeur** → **Accepter**

---

### Étape 3 — Obtenir le token d'accès

**Via Meta Business Suite (recommandé pour la production) :**

1. Aller sur **Meta Business Suite** → **Paramètres** → **Comptes** → **Instagram**
2. Sélectionner le compte Instagram Business
3. Dans **Messenger API Settings** → **Generate Token**
4. Copier le token (Instagram User Access Token)

**Via Graph API Explorer (pour les tests) :**

1. Aller sur `developers.facebook.com/tools/explorer`
2. Sélectionner l'app → **Generate Access Token**
3. Cocher les permissions : `instagram_basic`, `instagram_manage_messages`,
   `pages_show_list`, `pages_read_engagement`
4. Cliquer **Generate** → copier le token court-lived
5. L'échange en long-lived se fait automatiquement via `MetaTokenService`

---

### Étape 4 — Récupérer l'Instagram Business Account ID

```
GET https://graph.facebook.com/{version}/me/accounts
Authorization: Bearer {page_access_token}
```

Réponse :
```json
{
  "data": [{
    "id": "PAGE_ID",
    "instagram_business_account": { "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID" }
  }]
}
```

Cet `INSTAGRAM_BUSINESS_ACCOUNT_ID` est l'`external_id` à fournir dans `CreateChannelDto.channel_id`.

---

### Étape 5 — Configurer le webhook Instagram

1. Dans le dashboard app → **Instagram** → **Messenger API Settings** → **Webhooks**
   (ou dans **Webhooks** → **Instagram**)
2. Cliquer **Add Callback URL**
3. Remplir :
   - **Callback URL** : `https://your-domain.com/webhooks/instagram`
   - **Verify Token** : valeur de `INSTAGRAM_VERIFY_TOKEN` dans le `.env`
4. Cliquer **Verify and Save**
5. Dans **Webhook Fields** → activer :
   - ✅ `messages` — messages entrants
   - ✅ `messaging_seen` — confirmations de lecture
   - ✅ `messaging_referral` — liens de référence
   - ✅ `standby` (optionnel — si handover protocol activé)
6. Associer le compte Instagram au webhook :
   - Section **Instagram Accounts** → sélectionner le compte → **Subscribe**

---

### Étape 6 — Permissions requises (App Review)

En mode Development, seuls les admins/testeurs peuvent envoyer des messages.

Permissions à demander via **App Review** :

| Permission | Usage |
|---|---|
| `instagram_basic` | Infos de base du compte |
| `instagram_manage_messages` | Lire et envoyer des DM |
| `pages_show_list` | Lister les pages liées |
| `pages_read_engagement` | Lire les engagements de la page |

**Pour soumettre la review :**
1. **App Review** → **Permissions and Features** → demander chaque permission
2. Fournir :
   - Description de l'utilisation (messagerie B2C, support client, etc.)
   - Screencast montrant le flux complet
   - Instructions de test pour les reviewers Meta
3. Basculer l'app en **Live** une fois approuvé

---

### Étape 7 — Handover Protocol (optionnel)

Si plusieurs apps gèrent les messages Instagram (ex : chatbot + agent humain) :

1. Dans **Instagram** → **Messenger API Settings** → **Connected Tools**
2. Configurer le **Primary Receiver** (app qui reçoit en premier)
3. Le **Secondary Receiver** reçoit via le channel `standby`
4. Transférer le contrôle via l'API : `POST /{conversation_id}/pass_thread_control`

> Pour notre cas (agents humains uniquement), ignorer cette section.

---

### Étape 8 — Tester

1. Depuis un compte Instagram **non-admin**, envoyer un DM au compte Business
2. Vérifier dans les logs que le webhook est reçu et traité
3. Tester la réponse depuis l'interface admin

> En mode Development, utiliser un compte Instagram ajouté comme testeur dans l'app.

---

### Récapitulatif des valeurs à récupérer

| Variable | Où la trouver | Destination |
|---|---|---|
| `META_APP_ID` | App Settings → Basic | `.env` (déjà présent) |
| `META_APP_SECRET` | App Settings → Basic | `.env` (déjà présent) |
| `INSTAGRAM_VERIFY_TOKEN` | Choisi librement | `.env` |
| Instagram User Access Token | Graph API Explorer ou Business Suite | `CreateChannelDto.token` |
| Instagram Business Account ID | `GET /me/accounts` | `CreateChannelDto.channel_id` |

---

## Phase 1 — Interfaces & types

**Nouveau fichier :** `src/whapi/interface/instagram-webhook.interface.ts`

```typescript
export interface InstagramSender { id: string }
export interface InstagramRecipient { id: string }

export interface InstagramAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'ig_reel' | 'share' | 'story_mention' | 'reel';
  payload: {
    url?: string;
    title?: string;
    reel_video_id?: string;
  };
}

export interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  reply_to?: {
    mid?: string;
    story?: { url: string; id: string };
  };
  reactions?: {
    reaction: string;
    emoji: string;
    action: 'react' | 'unreact';
  };
  is_unsupported?: boolean;
  is_deleted?: boolean;
}

export interface InstagramSeen {
  watermark: number;
}

export interface InstagramReferral {
  ref: string;
  source: string;
  type: string;
}

export interface InstagramMessaging {
  sender: InstagramSender;
  recipient: InstagramRecipient;
  timestamp: number;
  message?: InstagramMessage;
  read?: InstagramSeen;
  referral?: InstagramReferral;
}

export interface InstagramEntry {
  id: string;           // instagram_business_account_id
  time: number;
  messaging: InstagramMessaging[];
}

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: InstagramEntry[];
}
```

---

## Phase 2 — Adapter inbound

**Nouveau fichier :** `src/webhooks/adapters/instagram.adapter.ts`

```typescript
@Injectable()
export class InstagramAdapter implements ProviderAdapter<InstagramWebhookPayload> {
  normalizeMessages(payload, context): UnifiedMessage[] { ... }
  normalizeStatuses(payload, context): UnifiedStatus[] { ... }
}
```

### Mapping de types Instagram → UnifiedMessageType

| Instagram | Unifié |
|---|---|
| `message.text` (sans attachment) | `text` |
| `attachment.type = 'image'` | `image` |
| `attachment.type = 'video'` | `video` |
| `attachment.type = 'audio'` | `audio` |
| `attachment.type = 'file'` | `document` |
| `attachment.type = 'ig_reel'` ou `'reel'` | `video` |
| `attachment.type = 'story_mention'` | `unknown` (logguer, ignorer) |
| `attachment.type = 'share'` | `unknown` |
| `message.reactions` | ignorer (pas de UnifiedType pour reactions, V2) |
| `message.is_deleted` | ignorer |

### Mapping chatId
```
{sender.igsid}@instagram
```

### Direction
- Si `sender.id === instagram_business_account_id` → `direction: 'out'`
- Sinon → `direction: 'in'`

### Reply to
Mapper depuis `message.reply_to.mid` si présent.

### Statuses (seen/read)

Identique à Messenger : `read.watermark` → `UnifiedStatus` avec `status: 'read'`.
Implémenter en V2 (résolution des mids par watermark).

---

## Phase 3 — Service outbound

**Nouveau fichier :** `src/communication_whapi/communication_instagram.service.ts`

### Endpoint d'envoi (identique à Messenger)
```
POST https://graph.facebook.com/{version}/me/messages
Authorization: Bearer {instagram_user_token}
```

### Body JSON (texte)
```json
{
  "recipient": { "id": "{igsid}" },
  "message": { "text": "Bonjour !" }
}
```

### Body JSON (image)
```json
{
  "recipient": { "id": "{igsid}" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": { "url": "https://...", "is_reusable": true }
    }
  }
}
```

> Même contrainte que Messenger : URL publique ou Attachment Upload API.

### Limitations Instagram

- **Texte seulement** : Instagram ne supporte pas les templates complexes hors texte + médias simples
- **Pas d'audio** : l'envoi d'audio via DM n'est pas supporté par l'API (uniquement réception)
- **Taille médias** : images < 8 MB, vidéos < 25 MB

### Méthodes du service

```typescript
sendTextMessage(params: {
  text: string;
  recipientIgsid: string;
  accessToken: string;
  quotedMessageId?: string;
}): Promise<{ providerMessageId: string }>

sendMediaMessage(params: {
  recipientIgsid: string;
  accessToken: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'document';
  caption?: string;
}): Promise<{ providerMessageId: string }>
```

---

## Phase 4 — Webhook inbound

### 4.1 Route dans `whapi.controller.ts`

```typescript
// Vérification (GET) — partage potentiellement la même route que Messenger
// (Meta permet d'utiliser le même verify_token pour plusieurs produits)
@Get('webhooks/instagram')
verifyInstagramWebhook(@Query() query, @Res() res): void {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

// Reception (POST)
@Post('webhooks/instagram')
async handleInstagramWebhook(
  @Body() body: InstagramWebhookPayload,
  @Headers('x-hub-signature-256') signature: string,
): Promise<void> {
  // 1. Vérifier signature HMAC-SHA256 (même logique que Meta WA)
  // 2. Filtrer object !== 'instagram'
  // 3. Pour chaque entry.messaging :
  //    a. Résoudre tenantId via instagram_business_account_id (entry.id)
  //    b. Idempotency check sur messaging.message.mid
  //    c. Appeler unifiedIngressService.ingestInstagram(body, context)
}
```

> **Option alternative :** Meta peut envoyer les webhooks Instagram sur la même URL
> que Messenger si l'app est configurée ainsi. Dans ce cas, discriminer sur
> `payload.object === 'instagram'` vs `'page'` dans un seul handler.

### 4.2 Résolution du tenant

`instagram_business_account_id` (entry.id) → `external_id` dans `ProviderChannel`.
Appel : `channelService.resolveTenantByProviderExternalId('instagram', igBusinessId)`

---

## Phase 5 — Unified Ingress

Ajouter dans `unified-ingress.service.ts` :

```typescript
async ingestInstagram(
  payload: InstagramWebhookPayload,
  context: AdapterContext,
): Promise<void> {
  const adapter = this.registry.get('instagram') as InstagramAdapter;
  const messages = adapter.normalizeMessages(payload, context);
  const statuses = adapter.normalizeStatuses(payload, context);
  for (const msg of messages) await this.inboundMessageService.process(msg);
  for (const st of statuses) await this.inboundMessageService.processStatus(st);
}
```

---

## Phase 6 — Registry & OutboundRouter

### 6.1 `provider-adapter.registry.ts`
```typescript
instagram: this.instagramAdapter,
```

### 6.2 `outbound-router.service.ts`
```typescript
if (provider === 'instagram') {
  const recipientIgsid = data.to; // IGSID stocké comme chatId sans @instagram
  return {
    providerMessageId: (await this.instagramService.sendTextMessage({
      text: data.text,
      recipientIgsid,
      accessToken: channel.token,
      quotedMessageId: data.quotedProviderMessageId,
    })).providerMessageId,
    provider: 'instagram',
  };
}
```

---

## Phase 7 — Channel Service

Ajouter un bloc `provider === 'instagram'` dans `channel.service.ts` :

```typescript
if (provider === 'instagram') {
  // channel_id = instagram_business_account_id
  // Échange token via MetaTokenService (même endpoint)
  // external_id = instagram_business_account_id
  // Upsert ProviderMapping provider='instagram'
  // version = 'instagram', ip = 'instagram', core_version = 'instagram-graph-api'
}
```

> Réutilise `MetaTokenService` sans modification.

---

## Phase 8 — Récapitulatif des fichiers

### Nouveaux fichiers
| Fichier | Rôle |
|---|---|
| `src/whapi/interface/instagram-webhook.interface.ts` | Types payload webhook |
| `src/webhooks/adapters/instagram.adapter.ts` | Normalisation inbound |
| `src/communication_whapi/communication_instagram.service.ts` | Envoi outbound |

### Fichiers à modifier
| Fichier | Modification |
|---|---|
| `src/whapi/whapi.controller.ts` | Ajouter GET + POST `/webhooks/instagram` |
| `src/webhooks/adapters/provider-adapter.registry.ts` | Enregistrer InstagramAdapter |
| `src/webhooks/unified-ingress.service.ts` | Ajouter `ingestInstagram()` |
| `src/communication_whapi/outbound-router.service.ts` | Ajouter case `'instagram'` |
| `src/channel/channel.service.ts` | Ajouter branche `provider === 'instagram'` |
| `src/webhooks/inbound-message.service.ts` | Adapter validation chatId (`@instagram`) |
| `src/whapi/whapi.module.ts` | Déclarer nouveaux services/adapters |

---

## Points d'attention spécifiques Instagram

1. **IGSID vs numéros** : Les identifiants Instagram sont des IGSID opaques.
   L'affichage côté front devra montrer le username (nécessite un appel API Graph
   `/{igsid}?fields=name,profile_pic` — à faire au moment de la création de conversation).

2. **Story replies** : Quand un utilisateur répond à une Story, `message.reply_to.story`
   est présent mais `mid` peut être absent. Traiter comme `unknown` ou `image`.

3. **Médias entrants** : Les URLs de médias dans le webhook Instagram expirent vite.
   Télécharger et stocker immédiatement à la réception (même comportement que Meta WA).

4. **Pas d'audio outbound** : Instagram Graph API ne supporte pas l'envoi d'audio
   en DM. Retourner une erreur explicite depuis l'OutboundRouter si `mediaType = 'audio'`.

5. **Human Agent Tag** : Pour les conversations initiées plus de 24h après le dernier
   message, utiliser `"messaging_type": "MESSAGE_TAG"` avec `"tag": "HUMAN_AGENT"`.
   Valable 7 jours après le message client.

6. **Rate limits** : 200 conversations/heure par compte Instagram Business.

7. **Token** : Les tokens Instagram System User sont permanents (pas d'expiration).
   Les tokens User expirent en 60 jours. À configurer dans `tokenExpiresAt`.

---

## Estimation de complexité

| Phase | Effort estimé |
|---|---|
| Interfaces & types | Faible (similaire Messenger) |
| Adapter inbound | Faible (très similaire Messenger) |
| Service outbound | Très faible (API identique Messenger) |
| Webhook controller | Très faible (copier Messenger) |
| Unified Ingress | Très faible |
| Registry + Router | Très faible |
| Channel Service | Très faible (réutilise MetaTokenService) |
| Gestion IGSID → username | Moyen (appel API supplémentaire) |
| **Tests + intégration** | **Moyen** |

> Instagram est la plus simple après Messenger car les deux partagent quasiment la
> même API outbound et la même structure webhook.
