# Plan d'implémentation — Telegram

## Vue d'ensemble

Telegram utilise la **Telegram Bot API**, une API REST simple et bien documentée.
Contrairement à Meta/Messenger, il n'y a pas de signatures complexes ni d'échanges
de tokens : un bot token suffit. Les webhooks sont enregistrés directement via l'API.

- **Provider string :** `'telegram'`
- **Auth :** Bot Token (format `123456789:ABCDEFabcdef...`)
- **external_id :** `bot_id` (partie numérique du token, ex: `123456789`)
- **Webhook registration :** `POST https://api.telegram.org/bot{token}/setWebhook`
- **API base :** `https://api.telegram.org/bot{token}/{method}`

---

## Prérequis Telegram

1. Créer un bot via **@BotFather** sur Telegram
2. Obtenir le bot token
3. Le serveur doit être en **HTTPS** avec certificat valide (Telegram exige SSL)
4. Variables d'environnement :
   ```env
   TELEGRAM_WEBHOOK_SECRET=...   # nouveau — secret token pour valider les webhooks
   ```
   > Le bot token est stocké dans `WhapiChannel.token` comme pour les autres providers.
   > `TELEGRAM_WEBHOOK_SECRET` est un secret arbitraire qu'on passe lors du `setWebhook`
   > et que Telegram renvoie dans le header `X-Telegram-Bot-Api-Secret-Token`.

---

## Architecture Telegram Bot API

### Concepts clés

| Concept | Description |
|---|---|
| `chat_id` | ID unique d'une conversation (utilisateur, groupe, canal) |
| `message_id` | ID d'un message dans un chat |
| `update_id` | ID croissant de chaque update webhook |
| `from.id` | ID de l'utilisateur expéditeur |
| `bot_id` | Partie numérique du token (premier segment avant `:`) |

### Modes de réception
- **Webhook** (recommandé pour production) : Telegram POST vers notre URL
- **Long polling** : GET `getUpdates` en boucle (à éviter en prod)

Ce plan utilise le **mode webhook**.

---

## Configuration officielle — Telegram BotFather

### Étape 1 — Créer un bot avec BotFather

1. Ouvrir Telegram (web, desktop ou mobile)
2. Chercher le contact **@BotFather** (compte officiel avec badge de vérification bleu)
3. Envoyer la commande `/newbot`
4. Suivre les instructions :
   - **Nom du bot** : nom affiché (ex : `Support MonEntreprise`)
   - **Username du bot** : identifiant unique se terminant par `bot` (ex : `monentreprise_support_bot`)
5. BotFather répond avec le **bot token** :
   ```
   Use this token to access the HTTP API:
   123456789:ABCDEFGHIJKLMNabcdefghijklmn
   ```
6. Copier ce token → il sera stocké dans `CreateChannelDto.token`

> URL : `t.me/BotFather`

---

### Étape 2 — Configurer le profil du bot

Toujours via @BotFather :

```
/setdescription     → Texte affiché sur la page du bot
/setabouttext       → Texte "À propos" dans le profil
/setuserpic         → Photo de profil du bot
/setcommands        → Liste des commandes (ex: /aide - Obtenir de l'aide)
```

Exemple de commandes utiles à configurer :
```
aide - Obtenir de l'aide
contact - Parler à un agent
```

---

### Étape 3 — Configurer les paramètres du bot

```
/setprivacy
```
Choisir **Disable** → le bot peut lire **tous** les messages dans les groupes.
(En mode **Enable** par défaut, le bot ne lit que les messages qui lui sont adressés.)

> Pour notre cas (conversations privées uniquement), laisser le mode par défaut **Enable**.

```
/setjoingroups
```
Choisir **Disable** pour empêcher que le bot soit ajouté à des groupes (recommandé
pour un bot de support client).

---

### Étape 4 — Obtenir le bot_id (optionnel, déjà dans le token)

Le `bot_id` est la partie numérique avant `:` dans le token :
```
123456789:ABCDEFGHIJKLMNabcdefghijklmn
        ↑
    bot_id = 123456789
```

Ou via l'API :
```
GET https://api.telegram.org/bot{token}/getMe
```
Réponse :
```json
{
  "ok": true,
  "result": {
    "id": 123456789,
    "is_bot": true,
    "first_name": "Support MonEntreprise",
    "username": "monentreprise_support_bot",
    "can_join_groups": false,
    "can_read_all_group_messages": false,
    "supports_inline_queries": false
  }
}
```

---

### Étape 5 — Enregistrer le webhook

Cette étape est automatisée par `ChannelService` lors de la création du channel.
Elle peut aussi être faite manuellement pour les tests :

```bash
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhooks/telegram/123456789",
    "secret_token": "VOTRE_TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true
  }'
```

Réponse attendue :
```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

**Vérifier le statut du webhook :**
```bash
curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"
```
Réponse :
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/webhooks/telegram/123456789",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "last_error_message": null,
    "max_connections": 40,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

**Supprimer le webhook (pour revenir au polling en dev) :**
```bash
curl "https://api.telegram.org/bot{TOKEN}/deleteWebhook"
```

---

### Étape 6 — Configurer HTTPS pour les webhooks

Telegram **refuse les webhooks HTTP**. Options pour le développement :

**Option A — ngrok (recommandé pour les tests locaux)**
```bash
ngrok http 3000
# Copier l'URL HTTPS générée → utiliser comme base pour le webhook URL
```

**Option B — Certificat auto-signé (avancé)**
```bash
openssl req -newkey rsa:2048 -sha256 -nodes -keyout server.key \
  -x509 -days 365 -out server.crt \
  -subj "/C=FR/ST=Paris/L=Paris/O=MonEntreprise/CN=your-domain.com"
```
Puis passer le certificat à `setWebhook` via le paramètre `certificate`.

**Option C — Production avec Let's Encrypt (recommandé)**
```bash
certbot --nginx -d your-domain.com
```

---

### Étape 7 — Tester le bot

1. Ouvrir Telegram → chercher `@username_du_bot`
2. Cliquer **Start** ou envoyer `/start`
3. Envoyer un message texte → vérifier dans les logs que le webhook est reçu
4. Tester l'envoi depuis l'interface admin → vérifier que le message arrive dans Telegram

**Test manuel via curl :**
```bash
# Envoyer un message de test
curl -X POST "https://api.telegram.org/bot{TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{ "chat_id": "CHAT_ID_DU_TEST", "text": "Test depuis le serveur" }'
```

---

### Étape 8 — Commandes BotFather utiles pour la maintenance

```
/mybots           → Lister tous les bots du compte
/token            → Régénérer le token (invalide l'ancien immédiatement)
/deletebot        → Supprimer un bot
/revoke           → Révoquer le token actuel
```

> ⚠️ Si le token est compromis, utiliser `/token` via BotFather pour en générer un nouveau.
> Mettre à jour le `.env` et relancer le service immédiatement.

---

### Récapitulatif des valeurs à récupérer

| Variable | Où la trouver | Destination |
|---|---|---|
| Bot Token | BotFather → `/newbot` | `CreateChannelDto.token` |
| Bot ID | Partie numérique du token | `CreateChannelDto.channel_id` (auto-rempli par `getMe`) |
| `TELEGRAM_WEBHOOK_SECRET` | Choisi librement | `.env` |
| `APP_URL` | URL publique HTTPS du serveur | `.env` |

---

## Phase 1 — Interfaces & types

**Nouveau fichier :** `src/whapi/interface/telegram-webhook.interface.ts`

```typescript
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
  title?: string;
  performer?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  duration: number;
  width: number;
  height: number;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  type: 'regular' | 'mask' | 'custom_emoji';
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  file_size?: number;
}

export interface TelegramLocation {
  longitude: number;
  latitude: number;
  horizontal_accuracy?: number;
}

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

export interface TelegramReplyTo {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;           // absent si le message vient d'un canal
  chat: TelegramChat;
  date: number;                  // Unix timestamp
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];   // tableau, prendre le dernier (meilleure résolution)
  document?: TelegramDocument;
  audio?: TelegramAudio;
  voice?: TelegramVoice;
  video?: TelegramVideo;
  sticker?: TelegramSticker;
  location?: TelegramLocation;
  contact?: TelegramContact;
  reply_to_message?: TelegramReplyTo;
  forward_from?: TelegramUser;
  forward_date?: number;
  edit_date?: number;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  channel_post?: TelegramMessage;
}

// Telegram envoie un seul Update par POST (pas d'array)
export type TelegramWebhookPayload = TelegramUpdate;
```

---

## Phase 2 — Adapter inbound

**Nouveau fichier :** `src/webhooks/adapters/telegram.adapter.ts`

```typescript
@Injectable()
export class TelegramAdapter implements ProviderAdapter<TelegramWebhookPayload> {
  normalizeMessages(payload, context): UnifiedMessage[] { ... }
  normalizeStatuses(payload, context): UnifiedStatus[] { ... }
}
```

### Mapping de types Telegram → UnifiedMessageType

| Telegram | Unifié |
|---|---|
| `message.text` | `text` |
| `message.photo` | `image` |
| `message.video` | `video` |
| `message.audio` | `audio` |
| `message.voice` | `voice` |
| `message.document` | `document` |
| `message.sticker` | `sticker` |
| `message.location` | `location` |
| `message.contact` | `unknown` (pas de type unifié pour contact) |
| `callback_query` | `interactive` |
| `edited_message` | ignorer (V2 : mettre à jour le message existant) |
| `channel_post` | ignorer (messages de canaux, hors scope) |

### Mapping chatId
```
{chat.id}@telegram
```
> `chat.id` est un entier (positif pour utilisateurs/groupes, négatif pour groupes).
> Convertir en string : `String(message.chat.id)`.

### Direction
- Les messages entrants via webhook ont `from.id !== botId` → `direction: 'in'`
- Les messages envoyés par le bot n'arrivent pas via webhook → pas de `direction: 'out'`
  pour les inbound (les messages outbound sont créés côté serveur avec `direction: 'out'`
  directement lors de l'envoi, sans passer par le webhook)

### from / fromName
- `from.id` → `from`
- `${from.first_name} ${from.last_name ?? ''}`.trim() → `fromName`
- `from.username` → stocker dans le chatId ou un champ séparé (à définir)

### quotedProviderMessageId
Mapper depuis `message.reply_to_message.message_id` (converti en string).

### Media : résolution file_id → URL

Telegram ne fournit pas d'URL directe dans le webhook. Pour obtenir l'URL du fichier :
```
GET https://api.telegram.org/bot{token}/getFile?file_id={file_id}
→ { file_path: "photos/file_123.jpg" }
URL = https://api.telegram.org/file/bot{token}/{file_path}
```

Cette résolution doit se faire dans `InboundMessageService` ou dans un service dédié
`TelegramMediaService.resolveFileUrl(fileId, botToken)`.

Stocker dans `UnifiedMedia.link`.

### Photo : choisir la meilleure résolution
```typescript
const bestPhoto = message.photo[message.photo.length - 1]; // dernier = plus grande taille
```

### Statuses

Telegram ne fournit **pas** de delivery/read receipts via webhook Bot API.
`normalizeStatuses()` retourne toujours `[]`.

---

## Phase 3 — Service outbound

**Nouveau fichier :** `src/communication_whapi/communication_telegram.service.ts`

### Endpoint de base
```
https://api.telegram.org/bot{token}/{method}
```

### 3.1 Envoi texte — `sendMessage`
```
POST /sendMessage
{
  "chat_id": 123456789,
  "text": "Bonjour !",
  "parse_mode": "HTML",           // optionnel, HTML ou MarkdownV2
  "reply_to_message_id": 42       // optionnel, pour les replies
}
```
Réponse → `result.message_id` → `providerMessageId`

### 3.2 Envoi photo — `sendPhoto`
```
POST /sendPhoto  (multipart/form-data)
chat_id: 123456789
photo: <buffer>
caption: "Légende"
reply_to_message_id: 42   (optionnel)
```

### 3.3 Envoi vidéo — `sendVideo`
```
POST /sendVideo  (multipart/form-data)
chat_id: 123456789
video: <buffer>
caption: "Légende"
```

### 3.4 Envoi audio — `sendAudio`
```
POST /sendAudio  (multipart/form-data)
chat_id: 123456789
audio: <buffer>
```

### 3.5 Envoi voix — `sendVoice`
```
POST /sendVoice  (multipart/form-data)
chat_id: 123456789
voice: <buffer>
```

### 3.6 Envoi document — `sendDocument`
```
POST /sendDocument  (multipart/form-data)
chat_id: 123456789
document: <buffer>
filename: "rapport.pdf"
```

### Méthodes du service

```typescript
sendTextMessage(params: {
  text: string;
  chatId: string;              // {chat.id} sans @telegram
  botToken: string;
  quotedMessageId?: string;    // reply_to_message_id
}): Promise<{ providerMessageId: string }>

sendMediaMessage(params: {
  chatId: string;
  botToken: string;
  mediaBuffer: Buffer;
  mimeType: string;
  fileName: string;
  mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document';
  caption?: string;
  quotedMessageId?: string;
}): Promise<{ providerMessageId: string }>
```

---

## Phase 4 — Webhook inbound

### 4.1 Enregistrement du webhook (setup)

À faire lors de la création d'un channel Telegram dans `ChannelService` :

```
POST https://api.telegram.org/bot{token}/setWebhook
{
  "url": "https://your-domain.com/webhooks/telegram",
  "secret_token": "{TELEGRAM_WEBHOOK_SECRET}",
  "allowed_updates": ["message", "edited_message", "callback_query"]
}
```

Créer une méthode dans `CommunicationTelegramService.registerWebhook(token, webhookUrl)`.

### 4.2 Route dans `whapi.controller.ts`

```typescript
@Post('webhooks/telegram')
async handleTelegramWebhook(
  @Body() body: TelegramWebhookPayload,
  @Headers('x-telegram-bot-api-secret-token') secretToken: string,
): Promise<void> {
  // 1. Vérifier secretToken === process.env.TELEGRAM_WEBHOOK_SECRET
  if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    throw new ForbiddenException('Invalid Telegram secret token');
  }

  // 2. Ignorer les updates sans message (edited_message, channel_post, etc.)
  const message = body.message ?? body.callback_query?.message;
  if (!message) return;

  // 3. Extraire bot_id depuis le chat ou via le token (préchargé au démarrage)
  //    → Résoudre tenantId via bot_id = external_id dans ProviderChannel
  const botId = await this.telegramService.resolveBotId(body);
  const tenantId = await this.channelService
    .resolveTenantByProviderExternalId('telegram', botId);
  if (!tenantId) return;

  // 4. Idempotency check sur update_id ou message_id
  const messageId = String(body.message?.message_id ?? body.update_id);
  const isDuplicate = await this.idempotencyService.check('telegram', messageId);
  if (isDuplicate) return;

  // 5. Ingestion
  const context: AdapterContext = { provider: 'telegram', tenantId, channelId: botId };
  await this.unifiedIngressService.ingestTelegram(body, context);
}
```

### 4.3 Résolution du tenant

Contrairement à Meta qui fournit l'ID du compte dans le payload, Telegram ne dit pas
explicitement à quel bot le message est destiné dans le body.

**Solution :** Lors du `setWebhook`, une URL unique par bot peut être utilisée :
```
/webhooks/telegram/{bot_id}
```

Ou bien : le contrôleur récupère la correspondance `secretToken → tenantId` depuis
la DB (le `TELEGRAM_WEBHOOK_SECRET` peut être unique par tenant/bot).

**Recommandation :** URL par bot_id :
```typescript
@Post('webhooks/telegram/:botId')
async handleTelegramWebhook(
  @Param('botId') botId: string,
  @Body() body: TelegramWebhookPayload,
  @Headers('x-telegram-bot-api-secret-token') secretToken: string,
): Promise<void> { ... }
```

---

## Phase 5 — Unified Ingress

Ajouter dans `unified-ingress.service.ts` :

```typescript
async ingestTelegram(
  payload: TelegramWebhookPayload,
  context: AdapterContext,
): Promise<void> {
  const adapter = this.registry.get('telegram') as TelegramAdapter;
  const messages = adapter.normalizeMessages(payload, context);
  // Telegram n'a pas de statuts
  for (const msg of messages) await this.inboundMessageService.process(msg);
}
```

---

## Phase 6 — Registry & OutboundRouter

### 6.1 `provider-adapter.registry.ts`
```typescript
telegram: this.telegramAdapter,
```

### 6.2 `outbound-router.service.ts`
```typescript
if (provider === 'telegram') {
  const chatId = data.to; // ex: "123456789" (sans @telegram)
  return {
    providerMessageId: (await this.telegramService.sendTextMessage({
      text: data.text,
      chatId,
      botToken: channel.token,
      quotedMessageId: data.quotedProviderMessageId,
    })).providerMessageId,
    provider: 'telegram',
  };
}
```

Pour `sendMediaMessage` :
```typescript
if (provider === 'telegram') {
  return {
    providerMessageId: (await this.telegramService.sendMediaMessage({
      chatId: data.to,
      botToken: channel.token,
      mediaBuffer: data.mediaBuffer,
      mimeType: data.mimeType,
      fileName: data.fileName,
      mediaType: data.mediaType,
      caption: data.caption,
    })).providerMessageId,
    provider: 'telegram',
  };
}
```

---

## Phase 7 — Channel Service

Ajouter un bloc `provider === 'telegram'` dans `channel.service.ts` :

```typescript
if (provider === 'telegram') {
  // 1. Appeler getMe pour valider le token et obtenir le bot_id
  //    GET https://api.telegram.org/bot{token}/getMe
  //    → { id: 123456789, username: "monbot", first_name: "MonBot" }

  const botInfo = await this.telegramService.getMe(dto.token);

  const telegramChannel = this.channelRepository.create({
    provider: 'telegram',
    external_id: String(botInfo.id),   // bot_id
    token: dto.token,
    channel_id: String(botInfo.id),
    start_at: Math.floor(Date.now() / 1000),
    uptime: 0,
    version: 'telegram-bot-api',
    ip: 'telegram',
    device_id: 0,
    is_business: false,
    api_version: 'v7',
    core_version: 'telegram-bot-api',
  });

  const saved = await this.channelRepository.save(telegramChannel);
  const tenantId = await this.ensureTenantId(saved);
  await this.upsertProviderMapping({
    tenant_id: tenantId,
    provider: 'telegram',
    external_id: String(botInfo.id),
    channel_id: String(botInfo.id),
  });

  // 2. Enregistrer le webhook
  const webhookUrl = `${process.env.APP_URL}/webhooks/telegram/${botInfo.id}`;
  await this.telegramService.registerWebhook(dto.token, webhookUrl);

  return this.channelRepository.findOne({ where: { id: saved.id } });
}
```

### Variables d'environnement requises
```env
APP_URL=https://your-domain.com   # URL publique de l'app (pour setWebhook)
```

---

## Phase 8 — Service dédié Telegram (getMe + registerWebhook)

Il est plus propre d'ajouter `getMe()` et `registerWebhook()` dans
`CommunicationTelegramService` plutôt que dans `ChannelService` :

```typescript
async getMe(token: string): Promise<{ id: number; username: string; first_name: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getMe failed: ${data.description}`);
  return data.result;
}

async registerWebhook(token: string, webhookUrl: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram setWebhook failed: ${data.description}`);
}

async resolveFileUrl(fileId: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}
```

---

## Phase 9 — Récapitulatif des fichiers

### Nouveaux fichiers
| Fichier | Rôle |
|---|---|
| `src/whapi/interface/telegram-webhook.interface.ts` | Types payload webhook Telegram |
| `src/webhooks/adapters/telegram.adapter.ts` | Normalisation inbound |
| `src/communication_whapi/communication_telegram.service.ts` | Envoi outbound + setup |

### Fichiers à modifier
| Fichier | Modification |
|---|---|
| `src/whapi/whapi.controller.ts` | Ajouter POST `/webhooks/telegram/:botId` |
| `src/webhooks/adapters/provider-adapter.registry.ts` | Enregistrer TelegramAdapter |
| `src/webhooks/unified-ingress.service.ts` | Ajouter `ingestTelegram()` |
| `src/communication_whapi/outbound-router.service.ts` | Ajouter case `'telegram'` |
| `src/channel/channel.service.ts` | Ajouter branche `provider === 'telegram'` |
| `src/webhooks/inbound-message.service.ts` | Adapter validation chatId (`@telegram`) |
| `src/whapi/whapi.module.ts` | Déclarer TelegramAdapter + CommunicationTelegramService |

---

## Points d'attention spécifiques Telegram

1. **HTTPS obligatoire** : Telegram refuse les webhooks HTTP. En développement, utiliser
   ngrok ou un tunnel équivalent.

2. **Pas de receipts** : Telegram Bot API ne fournit pas de delivery/read receipts.
   Les statuts ne peuvent pas être trackés.

3. **chat.id négatif pour les groupes** : Les IDs de groupes/supergroups sont négatifs.
   La regex de validation chatId doit accepter les négatifs : `^-?[0-9]+@telegram$`.

4. **file_id éphémère** : Les `file_id` sont stables pour le même bot mais peuvent
   changer entre bots. Toujours résoudre l'URL et stocker le fichier immédiatement.

5. **Taille maximale via Bot API** :
   - Upload via API : 50 MB
   - Download via API : 20 MB
   - Pour les gros fichiers, utiliser le Bot API Local Server (auto-hébergé)

6. **Groupes vs conversations privées** : Le système actuel est conçu pour des
   conversations 1-à-1. Les messages de groupes peuvent arriver mais la dispatch
   logic ne s'y applique pas naturellement. Filtrer `chat.type === 'private'` en V1.

7. **Pas de token refresh** : Le bot token est permanent (sauf si révoqué via BotFather).
   `tokenExpiresAt = null`.

8. **Rate limits** : 30 messages/seconde globalement, 1 message/seconde par chat.
   Implémenter un queue/throttle si nécessaire.

9. **Polling vs Webhook** : Ne pas activer les deux simultanément — Telegram les
   considère exclusifs. En dev, désactiver le webhook avant de tester avec polling.

---

## Estimation de complexité

| Phase | Effort estimé |
|---|---|
| Interfaces & types | Faible (API bien documentée) |
| Adapter inbound | Moyen (résolution file_id → URL, chat.id négatifs) |
| Service outbound | Moyen (multipart/form-data pour les médias) |
| Webhook controller | Faible |
| Enregistrement webhook (setWebhook) | Faible |
| Unified Ingress | Très faible |
| Registry + Router | Très faible |
| Channel Service + getMe | Faible |
| Filtrage groupes / privé | Faible |
| **Tests + intégration** | **Moyen** |

> Telegram est le plus simple à comprendre (API claire, pas de tokens complexes)
> mais nécessite quelques adaptations pour la résolution des médias et les chat.id
> négatifs des groupes.
