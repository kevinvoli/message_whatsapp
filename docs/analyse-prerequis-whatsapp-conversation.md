# Analyse prerequis reception conversation WhatsApp

## Contexte
Analyse effectuee sur le backend `message_whatsapp/` et l'admin `admin/` pour repondre a la question:

- Quels prerequis faut-il remplir pour recevoir une conversation WhatsApp ?
- Dans le cas WhatsApp (Whapi/Meta), comment enregistrer le channel et rendre l'ingestion fonctionnelle ?

---

## 1) Prerequis techniques minimum

### 1.1 Backend demarre + DB disponible
Le backend exige une configuration MySQL + port serveur:

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `SERVER_PORT` dans `message_whatsapp/src/app.module.ts:48`
- `rawBody: true` est actif pour valider les signatures webhook (`message_whatsapp/src/main.ts:11`)
- CORS + cookies sont actifs (`message_whatsapp/src/main.ts:23`, `message_whatsapp/src/main.ts:26`)

### 1.2 JWT/cookies pour l'admin
Les routes channel sont protegees admin:

- `@UseGuards(AdminGuard)` sur `message_whatsapp/src/channel/channel.controller.ts:9`
- Auth admin basee cookie `AuthenticationAdmin` + `JWT_SECRET`
  - `message_whatsapp/src/auth_admin/jwt_admin.strategy.ts:25`
  - `message_whatsapp/src/auth_admin/auth_admin.controller.ts:19`

### 1.3 Migrations DB appliquees
Le projet utilise des migrations TypeORM (`message_whatsapp/package.json`, script `migration:run`).
Pour la resolution tenant/provider, la table `channels` est critique:

- creation de `channels` dans `message_whatsapp/src/database/migrations/20260214_create_channels_mapping.ts:12`

Sans cette table/mapping, les webhooks entrants seront rejetes (422 Unknown channel mapping).

---

## 2) Comment le channel est enregistre aujourd'hui

### 2.1 Cote admin
L'UI admin "Gestion des Canaux WHAPI" envoie seulement un `token`:

- `createChannel(channel: { token: string })` dans `admin/src/app/lib/api.ts:113`
- formulaire token dans `admin/src/app/ui/ChannelsView.tsx:66`

### 2.2 Cote backend
Le `POST /channel` accepte seulement `{ token }`:

- DTO: `token` uniquement (`message_whatsapp/src/channel/dto/create-channel.dto.ts:5`)
- Le backend appelle Whapi `/health` pour recuperer `channel_id`, version, uptime, etc. puis enregistre dans `whapi_channels` (`message_whatsapp/src/channel/channel.service.ts:28`, `message_whatsapp/src/channel/channel.service.ts:46`)

---

## 3) Prerequis metier REELS pour recevoir une conversation

### 3.1 Prerequis A - mapping provider/external_id -> tenant
Le webhook exige de resoudre un tenant via mapping provider:

- Whapi: `resolveTenantOrReject('whapi', payload.channel_id)` (`message_whatsapp/src/whapi/whapi.controller.ts:50`)
- si mapping absent: `Unknown channel mapping` 422 (`message_whatsapp/src/whapi/whapi.controller.ts:590`)

Le mapping est lu via `ChannelService.resolveTenantByProviderExternalId(...)` (`message_whatsapp/src/channel/channel.service.ts:83`) et stocke dans la table `channels`.

Important:
- Le flow `POST /channel` actuel n'insere pas ce mapping automatiquement (il cree un `whapi_channels` mais ne fait pas `upsertProviderMapping`).
- Donc **en l'etat, enregistrer juste le token du channel ne suffit pas** pour accepter les webhooks entrants.

### 3.2 Prerequis B - webhook provider configure
#### Cas Whapi
- Endpoint entrant: `POST /webhooks/whapi` (`message_whatsapp/src/whapi/whapi.controller.ts:35`)
- Signature optionnelle hors prod, recommandee en prod:
  - `WHAPI_WEBHOOK_SECRET_HEADER`
  - `WHAPI_WEBHOOK_SECRET_VALUE`
  - (`WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS` pour rotation)
  - validation dans `message_whatsapp/src/whapi/whapi.controller.ts:282`

#### Cas Meta Cloud API
- Verification GET: `GET /webhooks/whatsapp` compare `hub.verify_token` a `WHATSAPP_VERIFY_TOKEN` (`message_whatsapp/src/whapi/whapi.controller.ts:166`)
- Reception POST: `POST /webhooks/whatsapp` (`message_whatsapp/src/whapi/whapi.controller.ts:176`)
- Signature via `WHATSAPP_APP_SECRET`/`WHATSAPP_APP_SECRET_PREVIOUS` (`message_whatsapp/src/whapi/whapi.controller.ts:326`)

### 3.3 Prerequis C - au moins un poste routable en queue
Meme si le webhook est accepte, la conversation peut ne pas etre persistee si aucun agent/poste n'est routable:

- Dispatcher retourne `null` quand aucun agent dispo (`message_whatsapp/src/dispatcher/dispatcher.service.ts:115`)
- Le pipeline inbound skip dans ce cas (`INCOMING_NO_AGENT`) (`message_whatsapp/src/webhooks/inbound-message.service.ts:66`)

A savoir:
- Au boot, la queue est reset et tous les postes passent inactifs (`message_whatsapp/src/dispatcher/services/queue.service.ts:31`, `message_whatsapp/src/dispatcher/services/queue.service.ts:342`)
- L'ajout en queue se fait quand un agent se connecte websocket (`message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:83`, `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:120`)

Donc prerequis operationnel: **au moins un commercial doit se connecter (socket) pour activer son poste et alimenter la queue**.

---

## 4) Reponse directe a "d'abord enregistrer un channel, mais pour WhatsApp comment faire ?"

### Ce qui est obligatoire
1. Creer le channel (token Whapi) via Admin -> `POST /channel`.
2. Creer le mapping provider pour le webhook entrant:
   - Whapi: `provider='whapi'`, `external_id=<channel_id Whapi>`, `tenant_id=<tenant du channel>` dans table `channels`.
   - Meta: `provider='meta'`, `external_id=<waba_id>`, `channel_id=<phone_number_id>`.
3. Configurer le webhook chez le provider vers:
   - Whapi -> `POST /webhooks/whapi`
   - Meta -> `GET/POST /webhooks/whatsapp` (+ verify token)
4. Avoir au moins un poste/commercial effectivement routable (queue non vide).

### Point de vigilance actuel (important)
Le CRUD channel de l'admin ne gere pas explicitement `provider/external_id/tenant_id` et le DTO backend n'accepte que `token`. Il manque donc un onboarding complet pour le mapping provider dans le flux admin.

---

## 5) Checklist rapide d'exploitation

- [ ] Migrations executees (`npm run migration:run` dans `message_whatsapp/`)
- [ ] Backend demarre avec MySQL + `JWT_SECRET` + `SERVER_PORT`
- [ ] Admin login OK (`/auth/admin/login`)
- [ ] Channel Whapi cree (token valide)
- [ ] Mapping `channels` present pour `provider/external_id`
- [ ] Webhook provider pointe sur le bon endpoint backend public
- [ ] Secrets de signature configures en production
- [ ] Au moins un poste actif en queue (agent connecte)
- [ ] Verifier trafic dans `GET /metrics/webhook`

---

## Conclusion
Oui, il faut bien "enregistrer d'abord un channel". Mais dans ce code, pour recevoir reellement une conversation WhatsApp, il faut **en plus** un mapping provider->tenant (`channels`) et une queue agent operationnelle. Sans ces 2 prerequis, le webhook sera soit rejete (422), soit accepte mais non transforme en conversation exploitable.
