# Plan d'implémentation — Facebook Messenger

## Vue d'ensemble

Facebook Messenger utilise la **Meta Graph API** (même famille que WhatsApp Business Meta).
La mécanique de webhook est identique (vérification `x-hub-signature-256`), mais les
endpoints, la structure des payloads et l'identité des contacts sont différents.

- **Provider string :** `'messenger'`
- **Auth :** Page Access Token (long-lived via échange App ID/Secret — même logique que Meta WA)
- **external_id :** `page_id` de la page Facebook
- **Webhook subscription :** `messages` + `message_deliveries` + `message_reads`
- **API version :** `https://graph.facebook.com/{version}/me/messages`

---

## Prérequis Meta / Facebook

1. Application Facebook avec le produit **Messenger** activé
2. Page Facebook associée
3. Permissions OAuth requises : `pages_messaging`, `pages_read_engagement`
4. Token court-lived obtenu via Meta Business → échangé en long-lived (60 jours)
5. Variables d'environnement :
   ```env
   META_APP_ID=...           # déjà présent (partagé WhatsApp)
   META_APP_SECRET=...       # déjà présent (partagé WhatsApp)
   META_API_VERSION=v21.0    # déjà présent
   MESSENGER_VERIFY_TOKEN=... # nouveau — token de vérification webhook Messenger
   ```

---

## Configuration officielle Meta — Messenger

### Étape 1 — Créer une application Meta

1. Aller sur **Meta for Developers** → **My Apps** → **Create App**
2. Choisir le type **Business**
3. Remplir : App Name, Contact Email, Business Account (optionnel au début)
4. Cliquer **Create App**

> URL : `developers.facebook.com/apps`

---

### Étape 2 — Ajouter le produit Messenger

1. Dans le dashboard de l'app → section **Add Products**
2. Trouver **Messenger** → cliquer **Set up**
3. Le produit Messenger apparaît dans le menu gauche

---

### Étape 3 — Associer une Page Facebook

1. Dans **Messenger** → **Messenger API Settings** → section **Access Tokens**
2. Cliquer **Add or Remove Pages**
3. Se connecter avec le compte Facebook propriétaire de la page
4. Sélectionner la page souhaitée → **Done**
5. Revenir dans **Access Tokens** → la page apparaît avec un bouton **Generate Token**
6. Cliquer **Generate Token** → copier le token court-lived (valable 1h)

> Ce token court-lived sera ensuite échangé en long-lived (60 jours) automatiquement
> par le `MetaTokenService` déjà en place dans le code.

---

### Étape 4 — Configurer le webhook

1. Dans **Messenger** → **Messenger API Settings** → section **Webhooks**
2. Cliquer **Add Callback URL**
3. Remplir :
   - **Callback URL** : `https://your-domain.com/webhooks/messenger`
   - **Verify Token** : valeur de `MESSENGER_VERIFY_TOKEN` dans le `.env`
4. Cliquer **Verify and Save**
   > Meta envoie un GET avec `hub.challenge` — notre endpoint doit répondre 200 avec
   > la valeur du challenge (voir Phase 4 du plan code).
5. Une fois vérifié → section **Webhook Fields** → activer :
   - ✅ `messages`
   - ✅ `message_deliveries`
   - ✅ `message_reads`
   - ✅ `messaging_postbacks` (pour les boutons)
6. Cliquer **Save**

---

### Étape 5 — Associer la Page au webhook

1. Toujours dans **Webhooks** → section **Pages**
2. Sélectionner la page créée → cliquer **Subscribe**

---

### Étape 6 — Configurer les variables d'environnement App

1. Dans **App Settings** → **Basic**
2. Copier :
   - **App ID** → `META_APP_ID` (déjà configuré)
   - **App Secret** → `META_APP_SECRET` (déjà configuré)
3. Dans **Messenger API Settings** → **Access Tokens**
4. Copier le **Page Access Token** → utilisé dans `CreateChannelDto.token`
5. Copier le **Page ID** → utilisé dans `CreateChannelDto.channel_id`

---

### Étape 7 — Passer l'app en mode Live (production)

En mode **Development**, seuls les admins/testeurs de l'app reçoivent les messages.

1. Dans **App Review** → **Permissions and Features**
2. Demander les permissions :
   - `pages_messaging` (**requis**)
   - `pages_read_engagement` (**requis**)
3. Soumettre la review avec :
   - Description de l'utilisation
   - Vidéo de démonstration (screencast)
   - Instructions de test pour les reviewers
4. Une fois approuvé → basculer l'app en **Live** (toggle en haut du dashboard)

> En attendant la review, tester avec un compte admin de l'app.

---

### Étape 8 — Tester le webhook

Utiliser l'outil **Webhooks Test** de Meta :

1. Dans **Messenger** → **Messenger API Settings** → **Webhooks**
2. Cliquer **Test** à côté du champ `messages`
3. Meta envoie un payload de test → vérifier les logs du serveur

Ou envoyer un message à la page Facebook depuis un autre compte → vérifier que
le webhook est reçu et traité.

---

### Récapitulatif des valeurs à récupérer

| Variable | Où la trouver | Destination |
|---|---|---|
| `META_APP_ID` | App Settings → Basic | `.env` (déjà présent) |
| `META_APP_SECRET` | App Settings → Basic | `.env` (déjà présent) |
| `MESSENGER_VERIFY_TOKEN` | Choisi librement | `.env` |
| Page Access Token | Messenger API Settings → Access Tokens → Generate Token | `CreateChannelDto.token` |
| Page ID | Messenger API Settings → Access Tokens | `CreateChannelDto.channel_id` |

---

## Phase 1 — Interfaces & types

### 1.1 Interface du payload webhook Messenger

**Nouveau fichier :** `src/whapi/interface/messenger-webhook.interface.ts`

```typescript
export interface MessengerSender { id: string }
export interface MessengerRecipient { id: string }

export interface MessengerTextMessage {
  mid: string;
  text: string;
}

export interface MessengerAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'template' | 'fallback';
  payload: {
    url?: string;
    title?: string;
    sticker_id?: number;
  };
}

export interface MessengerQuickReply {
  payload: string;
  title?: string;
}

export interface MessengerMessage {
  mid: string;
  text?: string;
  attachments?: MessengerAttachment[];
  quick_reply?: MessengerQuickReply;
  reply_to?: { mid: string };
  sticker_id?: number;
}

export interface MessengerDelivery {
  mids: string[];
  watermark: number;
}

export interface MessengerRead {
  watermark: number;
}

export interface MessengerMessaging {
  sender: MessengerSender;
  recipient: MessengerRecipient;
  timestamp: number;
  message?: MessengerMessage;
  delivery?: MessengerDelivery;
  read?: MessengerRead;
  postback?: { payload: string; title: string };
}

export interface MessengerEntry {
  id: string;          // page_id
  time: number;
  messaging: MessengerMessaging[];
}

export interface MessengerWebhookPayload {
  object: 'page';
  entry: MessengerEntry[];
}
```

---

## Phase 2 — Adapter inbound

**Nouveau fichier :** `src/webhooks/adapters/messenger.adapter.ts`

```typescript
@Injectable()
export class MessengerAdapter implements ProviderAdapter<MessengerWebhookPayload> {
  normalizeMessages(payload, context): UnifiedMessage[] { ... }
  normalizeStatuses(payload, context): UnifiedStatus[] { ... }
}
```

### Mapping de types Messenger → UnifiedMessageType

| Messenger | Unifié |
|---|---|
| `message.text` (sans attachment) | `text` |
| `attachment.type = 'image'` | `image` |
| `attachment.type = 'video'` | `video` |
| `attachment.type = 'audio'` | `audio` |
| `attachment.type = 'file'` | `document` |
| `quick_reply` | `interactive` |
| `postback` | `interactive` |
| `sticker_id` présent | `sticker` |
| Fallback/template | `unknown` |

### Mapping chatId

Messenger n'utilise pas les numéros de téléphone. Le `chatId` sera :
```
{sender.id}@messenger
```
> ⚠️ Ce format doit être validé dans `InboundMessageService.validateChatId()` — la regex
> actuelle accepte probablement uniquement `@s.whatsapp.net`. Il faudra l'adapter pour
> accepter `@messenger`.

### Mapping `from` / direction

- `sender.id` = utilisateur FB qui a envoyé le message
- `recipient.id` = page Facebook (notre bot)
- Si `sender.id === page_id` → `direction: 'out'`, sinon `direction: 'in'`

### `quotedProviderMessageId`

Mapper depuis `message.reply_to.mid` si présent.

### Statuses (delivery & read)

Messenger envoie des events `delivery` et `read` séparés (pas de statuts par message ID
comme Meta WA). Le mapping vers `UnifiedStatus` sera :

```
delivery.mids[] → status: 'delivered' (un UnifiedStatus par mid)
read.watermark  → status: 'read' (tous les messages avant watermark considérés lus)
```

> Note : le watermark nécessite de résoudre les message IDs depuis la DB. Implémenter
> en deux étapes : d'abord `delivered`, puis `read` par watermark dans une V2.

---

## Phase 3 — Service outbound

**Nouveau fichier :** `src/communication_whapi/communication_messenger.service.ts`

### Endpoint d'envoi
```
POST https://graph.facebook.com/{version}/me/messages
Authorization: Bearer {page_access_token}
```

### Body JSON (texte)
```json
{
  "recipient": { "id": "{psid}" },
  "message": { "text": "Bonjour !" },
  "messaging_type": "RESPONSE"
}
```

### Body JSON (média)
```json
{
  "recipient": { "id": "{psid}" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": {
        "url": "https://...",
        "is_reusable": true
      }
    }
  }
}
```

> Messenger accepte les URLs publiques directement pour les médias (pas d'upload séparé
> comme Meta WA). Pour envoyer un buffer local il faut d'abord l'uploader sur un stockage
> accessible publiquement, ou utiliser l'Upload API Messenger (multipart/form-data).

### Réponse
```json
{ "recipient_id": "...", "message_id": "mid.xxx" }
```
→ `providerMessageId = message_id`

### Méthodes du service
```typescript
sendTextMessage(params: {
  text: string;
  recipientPsid: string;
  pageId: string;
  accessToken: string;
  quotedMessageId?: string;   // via message.reply_to.mid
}): Promise<{ providerMessageId: string }>

sendMediaMessage(params: {
  recipientPsid: string;
  pageId: string;
  accessToken: string;
  mediaUrl: string;           // URL publique ou résultat d'upload
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
}): Promise<{ providerMessageId: string }>
```

---

## Phase 4 — Webhook inbound

### 4.1 Route dans `whapi.controller.ts`

```typescript
// Vérification webhook (GET)
@Get('webhooks/messenger')
verifyMessengerWebhook(@Query() query, @Res() res): void {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

// Reception webhook (POST)
@Post('webhooks/messenger')
async handleMessengerWebhook(
  @Body() body: MessengerWebhookPayload,
  @Headers('x-hub-signature-256') signature: string,
): Promise<void> {
  // 1. Vérifier signature HMAC-SHA256 (même logique que Meta WA)
  // 2. Filtrer object !== 'page'
  // 3. Pour chaque entry.messaging :
  //    a. Résoudre tenantId via page_id (entry.id)
  //    b. Idempotency check sur messaging.message.mid
  //    c. Appeler unifiedIngressService.ingestMessenger(body, context)
}
```

### 4.2 Résolution du tenant

Le `page_id` (entry.id) sert d'`external_id` dans `ProviderChannel`.
Appel : `channelService.resolveTenantByProviderExternalId('messenger', pageId)`

---

## Phase 5 — Unified Ingress

Ajouter dans `unified-ingress.service.ts` :

```typescript
async ingestMessenger(
  payload: MessengerWebhookPayload,
  context: AdapterContext,
): Promise<void> {
  const adapter = this.registry.get('messenger') as MessengerAdapter;
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
// Ajouter :
messenger: this.messengerAdapter,
```

### 6.2 `outbound-router.service.ts`
```typescript
if (provider === 'messenger') {
  const recipientPsid = data.to; // PSID stocké comme chatId sans @messenger
  return {
    providerMessageId: (await this.messengerService.sendTextMessage({
      text: data.text,
      recipientPsid,
      pageId: channel.external_id,
      accessToken: channel.token,
      quotedMessageId: data.quotedProviderMessageId,
    })).providerMessageId,
    provider: 'messenger',
  };
}
```

---

## Phase 7 — Channel Service

Ajouter un bloc `provider === 'messenger'` dans `channel.service.ts` :

```typescript
if (provider === 'messenger') {
  // Même logique que Meta : channel_id = page_id
  // Échange de token via MetaTokenService (même endpoint Graph API)
  // external_id = page_id
  // Upsert ProviderMapping avec provider='messenger'
}
```

> Le `MetaTokenService` est réutilisable sans modification car l'endpoint d'échange
> de token Meta est le même pour Messenger et WhatsApp.

---

## Phase 8 — Validation chatId

Dans `InboundMessageService` (ou le validateur de chatId), ajouter le suffixe `@messenger` :

```typescript
// Avant : /^[^@]+@s\.whatsapp\.net$/
// Après :
const VALID_CHAT_ID = /^[^@]+@(s\.whatsapp\.net|messenger|instagram|telegram)$/;
```

---

## Phase 9 — Module NestJS

Dans `whapi.module.ts` (ou un nouveau `MessengerModule`), ajouter :
- `MessengerAdapter` en provider
- `CommunicationMessengerService` en provider
- Les injecter dans `OutboundRouterService` et `ProviderAdapterRegistry`

---

## Récapitulatif des fichiers à créer / modifier

### Nouveaux fichiers
| Fichier | Rôle |
|---|---|
| `src/whapi/interface/messenger-webhook.interface.ts` | Types payload webhook |
| `src/webhooks/adapters/messenger.adapter.ts` | Normalisation inbound |
| `src/communication_whapi/communication_messenger.service.ts` | Envoi outbound |

### Fichiers à modifier
| Fichier | Modification |
|---|---|
| `src/whapi/whapi.controller.ts` | Ajouter GET + POST `/webhooks/messenger` |
| `src/webhooks/adapters/provider-adapter.registry.ts` | Enregistrer MessengerAdapter |
| `src/webhooks/unified-ingress.service.ts` | Ajouter `ingestMessenger()` |
| `src/communication_whapi/outbound-router.service.ts` | Ajouter case `'messenger'` |
| `src/channel/channel.service.ts` | Ajouter branche `provider === 'messenger'` |
| `src/webhooks/inbound-message.service.ts` | Adapter validation chatId |
| `src/whapi/whapi.module.ts` | Déclarer nouveaux services/adapters |

---

## Points d'attention spécifiques Messenger

1. **PSID vs numéro de téléphone** : Messenger identifie les utilisateurs par un PSID
   (Page-Scoped ID), pas un numéro. Il faut adapter l'affichage côté front.

2. **Médias** : Pas d'upload API séparé simple — préférer URL publique ou utiliser
   l'Attachment Upload API (`/me/message_attachments`) pour réutilisabilité.

3. **24h window** : Messenger impose une fenêtre de 24h pour répondre aux messages
   entrants hors template. Au-delà, seuls les Message Tags sont autorisés.

4. **Postbacks** : Les boutons Messenger déclenchent des `postback` events, pas des
   `message` events. Traiter dans le normalizer.

5. **Token refresh** : Les Page Access Tokens longs-lived expirent en 60 jours.
   Prévoir un mécanisme de refresh (cron ou alerte).

---

## Estimation de complexité

| Phase | Effort estimé |
|---|---|
| Interfaces & types | Faible |
| Adapter inbound | Moyen (mapping chatId non-standard) |
| Service outbound | Faible (API simple) |
| Webhook controller | Faible (copier logique Meta WA) |
| Unified Ingress | Très faible |
| Registry + Router | Très faible |
| Channel Service | Faible (réutilise MetaTokenService) |
| Validation chatId | Très faible |
| Module | Très faible |
| **Tests + intégration** | **Moyen** |
