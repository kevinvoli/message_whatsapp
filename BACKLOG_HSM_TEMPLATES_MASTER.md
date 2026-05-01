# Backlog — Intégration HSM Templates & Outbound Init (master)

**Date :** 2026-04-30  
**Branche cible :** `master`  
**Référence :** branche `production` (commit `d8ad7ef`)  
**Règle absolue :** ne pas commiter — attendre l'instruction explicite de l'utilisateur

---

## Contexte

La branche `production` contient une implémentation complète de deux fonctionnalités :

1. **Outbound Init** — Envoyer un premier message à un contact non enregistré sur la plateforme, en choisissant le canal
2. **Templates HSM** — Créer, soumettre à Meta, valider via webhook, et envoyer des messages template (désactivé par défaut via `HSM_TEMPLATES_ENABLED = false`)

L'implémentation actuelle sur `master` est incorrecte (schéma de données différent, fonctionnalités manquantes). Ce backlog liste les tickets pour aligner fidèlement `master` sur `production`.

---

## Tickets Backend

### B1 — Remplacer l'entité `WhatsappTemplate`
**Fichier :** `message_whatsapp/src/whatsapp_template/entities/whatsapp_template.entity.ts`

**Problème actuel :** L'entité master utilise `bodyText`, `headerType`, `footerText`, `buttons`, `tenantId`, `metaTemplateId` — un schéma de données incompatible avec la production.

**Ce qui doit être fait :**
- Remplacer tout le contenu par le schéma production
- Colonnes : `id` (uuid), `channelId` (varchar 36, NOT NULL), `name` (varchar 100), `language` (varchar 10, défaut `fr`), `category` (varchar 50, nullable), `status` (enum `PENDING|APPROVED|REJECTED`, défaut `PENDING`), `components` (json, nullable), `externalId` (varchar 191, nullable), `rejectionReason` (varchar 500, nullable), `createdAt`, `updatedAt`
- Ajouter la relation `@ManyToOne(() => WhapiChannel)` avec `@JoinColumn({ name: 'channel_id', referencedColumnName: 'id' })`
- Supprimer : `tenantId`, `metaTemplateId`, `headerType`, `headerContent`, `bodyText`, `footerText`, `buttons`, `@DeleteDateColumn`
- Exporter `enum WhatsappTemplateStatus { PENDING, APPROVED, REJECTED }`

---

### B2 — Remplacer le service `WhatsappTemplateService`
**Fichier :** `message_whatsapp/src/whatsapp_template/whatsapp_template.service.ts`

**Problème actuel :** Service minimal sans soumission Meta, sans `findAllByChannel`, sans gestion de l'`externalId`.

**Ce qui doit être fait :**
- Injecter : `WhatsappTemplate` repository, `WhapiChannel` repository, `AppLogger`
- Implémenter `findAllByChannel(channelId: string, status?: string): Promise<WhatsappTemplate[]>` — filtre par UUID du canal et statut optionnel
- Implémenter `findOne(id: string): Promise<WhatsappTemplate | null>`
- Implémenter `findByExternalId(externalId: string): Promise<WhatsappTemplate | null>`
- Implémenter `findApprovedByName(channelId: string, name: string): Promise<WhatsappTemplate | null>`
- Implémenter `create(dto: CreateWhatsappTemplateDto): Promise<WhatsappTemplate>` :
  - Si canal `provider === 'meta'` → appeler `submitToMeta()`, stocker l'`externalId` retourné, status = `PENDING`
  - Si API Meta échoue → créer quand même avec `externalId = null` (warning loggué)
  - Sinon (whapi ou autre) → status = `APPROVED` directement
- Implémenter `updateStatusByExternalId(externalId, status, rejectionReason?)` — appelé par le webhook
- Implémenter `resubmit(id, updates?: UpdateWhatsappTemplateDto)` :
  - Vérifier que le template est `REJECTED` (sinon `BadRequestException`)
  - Vérifier que le canal est `meta` (sinon `BadRequestException`)
  - Appliquer les mises à jour optionnelles (name, language, category, components)
  - Appeler `submitToMeta()`, mettre à jour `externalId`, status → `PENDING`, `rejectionReason` → null
- Implémenter méthode privée `submitToMeta(data, channel: WhapiChannel)` :
  - POST `https://graph.facebook.com/{META_API_VERSION}/{channel.external_id}/message_templates`
  - Headers : `Authorization: Bearer {channel.token}`
  - Payload : `{ name, language, category?, components? }`
  - Extraire l'`id` de la réponse Meta
  - En cas d'erreur Axios : logger + throw `BadRequestException`

---

### B3 — Mettre à jour le module `WhatsappTemplateModule`
**Fichier :** `message_whatsapp/src/whatsapp_template/whatsapp_template.module.ts`

**Ce qui doit être fait :**
- Ajouter `WhapiChannel` dans `TypeOrmModule.forFeature([WhatsappTemplate, WhapiChannel])`
- Importer `LoggingModule`
- Exporter `[WhatsappTemplateService, TypeOrmModule]`

---

### B4 — Remplacer les DTOs
**Fichiers :**
- `message_whatsapp/src/whatsapp_template/dto/create-whatsapp-template.dto.ts`
- `message_whatsapp/src/whatsapp_template/dto/update-whatsapp-template.dto.ts` (à créer)

**Ce qui doit être fait :**

`CreateWhatsappTemplateDto` :
```
channelId: string       @IsString @IsNotEmpty  — UUID de WhapiChannel (champ id)
name: string            @IsString @IsNotEmpty
language?: string       @IsString @IsOptional
category?: string       @IsString @IsOptional
status?: WhatsappTemplateStatus  @IsEnum @IsOptional
components?: any        @IsOptional             — JSON (header, body, footer, buttons)
externalId?: string     @IsString @IsOptional
```

`UpdateWhatsappTemplateDto` (nouveau fichier) :
```
name?: string           @IsString @IsOptional
language?: string       @IsString @IsOptional
category?: string       @IsString @IsOptional
components?: any        @IsOptional
```

---

### B5 — Corriger les endpoints dans `WhatsappMessageController`
**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.controller.ts`

**Ce qui doit être fait :**
- `GET /messages/templates` : paramètre `channel_id` (UUID du WhapiChannel, pas `tenant_id`), appeler `templateService.findAllByChannel(channelId, status)`
- `POST /messages/templates` : passer le `dto` directement à `templateService.create(dto)` (plus besoin de mapping manuel)
- `PATCH /messages/templates/:id/resubmit` : accepter `@Body() dto: UpdateWhatsappTemplateDto`, passer à `templateService.resubmit(id, dto)`
- `POST /messages/outbound-init` : passer `text?`, `templateId?` (`dto.template_id`), `templateParams?` (`dto.template_params`), `contactName?` (`dto.contact_name`)
- Erreur quand HSM désactivé : `throw new NotFoundException(...)` (pas `SERVICE_UNAVAILABLE`)
- Importer et utiliser `UpdateWhatsappTemplateDto`

---

### B6 — Réécrire `createOutboundInitMessage` dans `WhatsappMessageService`
**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

**Problème actuel :** Méthode simplifiée, ne supporte que le texte, retourne une entité `WhatsappMessage`, pas de validation E.164, pas de gestion des templates.

**Ce qui doit être fait :**
- Injecter `WhatsappTemplateService` dans le constructeur
- Réécrire la signature : `createOutboundInitMessage(data: { channelId, recipient, text?, templateId?, templateParams?, contactName? }): Promise<{ chatId, messageId, contactId }>`
- Étape 1 : valider que `text` ou `templateId` est fourni (sinon `BadRequestException`)
- Étape 2 : charger le canal, récupérer le `provider`
- Étape 3 : valider E.164 si provider `whapi` ou `meta` — regex `^\d{7,15}$`
- Étape 4 : construire `chat_id` selon provider :
  - `whapi|meta` → `{recipient}@s.whatsapp.net`
  - `messenger` → `{recipient}@messenger`
  - `instagram` → `{recipient}@instagram`
  - `telegram` → `{recipient}@telegram`
- Étape 5 : `contactService.findOrCreate(recipient, chatId, contactName)`
- Étape 6 : `chatService.findOrCreateChatForOutbound({ chat_id: chatId, contactName, channelId: channel.channel_id })`
- Étape 7a (template) : charger le template via `templateService.findOne(templateId)`, appeler `outboundRouter.sendTemplateMessage({ to: recipient, channelId, templateName, languageCode, bodyParameters })`
- Étape 7b (texte) : appeler `outboundRouter.sendTextMessage({ to: recipient, text, channelId })`
- Étape 8 : persister le message en DB
- Étape 9 : `chatRepository.update({ chat_id: chatId }, { last_activity_at: new Date() })`
- Retourner `{ chatId, messageId: savedMessage.id, contactId: contact.id }`

---

### B7 — Corriger `findOrCreateChatForOutbound` dans `WhatsappChatService`
**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

**Ce qui doit être fait :**
- Changer la signature : `findOrCreateChatForOutbound(params: { chat_id, contactName, channelId })` (objet unique, plus deux paramètres séparés)
- Utiliser `params.chat_id` (déjà construit par l'appelant, pas besoin de rebuilder)
- `name: params.contactName` (pas juste le phone)
- `contact_client: params.chat_id.split('@')[0]`
- Ajouter `status: WhatsappChatStatus.EN_ATTENTE`

---

### B8 — Ajouter `sendTemplateMessage` dans `OutboundRouterService`
**Fichier :** `message_whatsapp/src/communication_whapi/outbound-router.service.ts`

**Ce qui doit être fait :**
- Ajouter méthode `sendTemplateMessage(data: { to, channelId, templateName, languageCode, bodyParameters? }): Promise<OutboundSendResponse>`
- Charger le canal, lire `provider`
- Si `meta` : vérifier `channel.external_id` présent, appeler `metaService.sendTemplateMessage({ to, phoneNumberId: channel.external_id, accessToken: channel.token, templateName, languageCode, bodyParameters })`, retourner `{ providerMessageId, provider: 'meta' }`
- Si `whapi` : appeler `whapiService.sendHsmToWhapiChannel({ to, channelId, templateName, languageCode, bodyParameters })`, retourner `{ providerMessageId: result.message.id, provider: 'whapi' }`
- Sinon : `BadRequestException` — template non supporté pour ce provider

---

### B9 — Ajouter `sendTemplateMessage` dans `CommunicationMetaService`
**Fichier :** `message_whatsapp/src/communication_whapi/communication_meta.service.ts`

**Ce qui doit être fait :**
- Ajouter méthode `sendTemplateMessage(data: { to, phoneNumberId, accessToken, templateName, languageCode, bodyParameters? }): Promise<{ providerMessageId: string }>`
- Construire le payload :
  ```json
  { "messaging_product": "whatsapp", "to": "...", "type": "template",
    "template": { "name": "...", "language": { "code": "..." }, "components": [...] } }
  ```
- `components` : si `bodyParameters` non vide, ajouter `{ type: 'body', parameters: [{ type: 'text', text: '...' }] }`
- POST `https://graph.facebook.com/{META_API_VERSION}/{phoneNumberId}/messages`
- Retry sur erreurs transitoires (même pattern que les autres méthodes du service)
- Extraire `response.data.messages[0].id`

---

### B10 — Ajouter `sendHsmToWhapiChannel` dans `CommunicationWhapiService`
**Fichier :** `message_whatsapp/src/communication_whapi/communication_whapi.service.ts`

**Ce qui doit être fait :**
- Ajouter méthode `sendHsmToWhapiChannel(data: { to, channelId, templateName, languageCode, bodyParameters? }): Promise<WhapiSendMessageResponse>`
- Charger le canal via `channelRepository.findOne({ where: { channel_id: data.channelId } })`
- Construire le payload Whapi HSM :
  ```json
  { "to": "...", "template": { "name": "...", "language": { "code": "..." }, "parameters": { "body": { "parameters": [...] } } } }
  ```
- POST `https://gate.whapi.cloud/messages/hsm` avec `Authorization: Bearer {token}`
- Retry sur erreurs transitoires (même pattern)

---

### B11 — Mettre à jour `WhapiController`
**Fichier :** `message_whatsapp/src/whapi/whapi.controller.ts`

**Ce qui doit être fait :**
- Injecter `WhatsappTemplateService` et `WhatsappMessageGateway` dans le constructeur
- Dans le handler `POST /webhooks/whatsapp` (Meta webhook), avant le traitement des messages normaux, détecter si `rawChange.field === 'message_template_status_update'` :
  - Si `HSM_TEMPLATES_ENABLED = false` → logger et retourner `{ status: 'ignored', reason: 'ff_hsm_templates_disabled' }`
  - Sinon : résoudre le canal par WABA ID, valider la signature HMAC, appeler `handleTemplateStatusUpdate(rawChange.value)` en async (fire & forget), retourner `{ status: 'ok' }`
- Implémenter méthode privée `handleTemplateStatusUpdate(value: any): Promise<void>` :
  - Extraire `externalId`, `event`, `templateName`, `reason`
  - Appeler `templateService.updateStatusByExternalId(externalId, event, reason)`
  - Si template trouvé : émettre `gateway.server.emit('admin:template_status_update', { templateId, externalId, name, status, rejectionReason })`
- Supprimer le `case 'message_template_status_update'` dans le handler Whapi webhook (ou le laisser en `break` silencieux)

---

### B12 — Mettre à jour `WhapiModule`
**Fichier :** `message_whatsapp/src/whapi/whapi.module.ts`

**Ce qui doit être fait :**
- Ajouter `WhatsappTemplateModule` dans `imports`

---

### B13 — Mettre à jour `DispatcherModule`
**Fichier :** `message_whatsapp/src/dispatcher/dispatcher.module.ts`

**Ce qui doit être fait :**
- Ajouter `WhatsappTemplateModule` dans `imports`

---

### B14 — Remplacer la migration
**Fichiers :**
- Remplacer `message_whatsapp/src/database/migrations/20260430_outbound_hsm_v1.ts`
- Supprimer `message_whatsapp/src/database/migrations/20260430_outbound_hsm_v2.ts`

**Ce qui doit être fait :**
- Le DDL de la migration v1 doit correspondre à l'entité production :
  ```sql
  CREATE TABLE IF NOT EXISTS `whatsapp_template` (
    `id`               varchar(36)  NOT NULL,
    `channel_id`       varchar(36)  NOT NULL,
    `name`             varchar(100) NOT NULL,
    `language`         varchar(10)  NOT NULL DEFAULT 'fr',
    `category`         varchar(50)  NULL,
    `status`           enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    `components`       json         NULL,
    `external_id`      varchar(191) NULL,
    `rejection_reason` varchar(500) NULL,
    `created_at`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at`       datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`),
    INDEX `IDX_whatsapp_template_channel_id` (`channel_id`),
    INDEX `IDX_whatsapp_template_channel_status` (`channel_id`, `status`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  ```
- Supprimer le fichier `20260430_outbound_hsm_v2.ts` (la colonne `rejection_reason` est déjà incluse dans v1)

---

### B15 — Corriger le DTO `CreateOutboundMessageDto`
**Fichier :** `message_whatsapp/src/whatsapp_message/dto/create-outbound-message.dto.ts`

**Ce qui doit être fait :**
- Remplacer par le DTO production avec class-validator :
  - `channel_id: string` `@IsString @IsNotEmpty`
  - `recipient: string` `@IsString @IsNotEmpty`
  - `text?: string` `@IsString @IsOptional`
  - `template_id?: string` `@IsString @IsOptional`
  - `template_params?: string[]` `@IsArray @IsString({ each: true }) @IsOptional`
  - `contact_name?: string` `@IsString @IsOptional`

---

## Tickets Frontend Admin

### A1 — Mettre à jour `definitions.ts`
**Fichier :** `admin/src/app/lib/definitions.ts`

**Ce qui doit être fait :**
- Remplacer la définition `WhatsappTemplate` par la version production :
  ```typescript
  export type WhatsappTemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
  export type WhatsappTemplate = {
    id: string;
    channelId: string;           // camelCase (UUID du WhapiChannel)
    name: string;
    language: string;
    category?: string | null;
    status: WhatsappTemplateStatus;
    components?: any | null;     // JSON components (header, body, footer, buttons)
    externalId?: string | null;  // ID Meta
    rejectionReason?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  ```
- Supprimer les champs snake_case actuels (`channel_id`, `body_text`, `header_type`, etc.)
- Supprimer `TemplateCategory` et les anciens types liés

---

### A2 — Mettre à jour `conversations.api.ts`
**Fichier :** `admin/src/app/lib/api/conversations.api.ts`

**Ce qui doit être fait :**
- `initiateOutboundConversation(payload)` :
  - Payload : `{ channel_id, recipient, text?, template_id?, template_params?, contact_name? }`
  - Retour : `{ chatId: string; messageId: string; contactId: string }` (camelCase — ce que le backend retourne)

---

### A3 — Mettre à jour `templates.api.ts`
**Fichier :** `admin/src/app/lib/api/templates.api.ts`

**Ce qui doit être fait :**
- `getWhatsappTemplates(channelId: string, status?: string)` : paramètre query `channel_id={channelId}` (UUID du WhapiChannel, pas `tenant_id`)
- `createWhatsappTemplate(payload)` : payload camelCase `{ channelId, name, language?, category?, components?, externalId? }`
- `resubmitWhatsappTemplate(id, updates?)` : body optionnel `{ name?, language?, category?, components? }`
- Supprimer les fonctions legacy `getTemplates`, `createTemplate`, `disableTemplate`, `deleteTemplate`

---

### A4 — Remplacer `OutboundMessageModal.tsx`
**Fichier :** `admin/src/app/ui/OutboundMessageModal.tsx`

**Ce qui doit être fait :**
- Remplacer intégralement par la version production
- Fonctionnalités clés :
  - Sélecteur de canal avec badge provider inline
  - `isTemplateMode = selectedChannel?.provider === 'meta'`
  - Si Meta : sélecteur de templates APPROVED (chargés via `getWhatsappTemplates(channel.id, 'APPROVED')`), aperçu du body, champs de paramètres dynamiques `{{1}}` `{{2}}`
  - Si Whapi/Messenger/etc. : textarea texte libre
  - Champ `contact_name` optionnel
  - Validation E.164 côté client (`^\d{7,15}$`) pour whapi/meta
  - Placeholder adaptatif selon provider
  - `onSuccess(result.chatId)` — camelCase
  - Gestion d'erreur inline (pas de toast)
  - `Ctrl+Entrée` pour envoyer dans le textarea

---

### A5 — Vérifier `ConversationsView.tsx`
**Fichier :** `admin/src/app/ui/ConversationsView.tsx`

**Ce qui doit être fait :**
- Vérifier que le callback `onSuccess` passe bien `result.chatId` (camelCase) depuis la réponse du backend
- Vérifier que `channels` passés au modal contiennent bien le champ `id` (UUID interne) en plus de `channel_id` — nécessaire pour charger les templates

---

## Ordre d'implémentation recommandé

```
B1 → B3 → B4 → B2         (entité + module + DTOs + service templates)
  → B14                    (migration cohérente avec l'entité)
  → B7                     (chat service findOrCreateChatForOutbound)
  → B9 → B10 → B8          (services communication Meta + Whapi + router)
  → B6 → B5 → B15          (message service + controller + DTO outbound)
  → B11 → B12 → B13        (webhook controller + modules)
  → A1 → A3 → A2 → A4 → A5  (frontend)
```

---

## Critères de validation

- [ ] `npx tsc --noEmit` → 0 erreur backend
- [ ] `npx tsc --noEmit` → 0 nouvelle erreur admin
- [ ] `POST /messages/outbound-init` avec texte libre → message envoyé, chat créé, retourne `{ chatId, messageId, contactId }`
- [ ] `POST /messages/templates` sur canal Whapi → template créé avec status `APPROVED`
- [ ] `POST /messages/templates` sur canal Meta → appel Meta API, status `PENDING`, `externalId` stocké
- [ ] `PATCH /messages/templates/:id/resubmit` sur template `REJECTED` → status `PENDING`, `externalId` mis à jour
- [ ] Webhook `message_template_status_update` (Meta) → statut mis à jour en DB + WebSocket `admin:template_status_update` émis
- [ ] `HSM_TEMPLATES_ENABLED = false` → endpoints templates retournent `404`, outbound-init reste fonctionnel
- [ ] Modal outbound : mode template si Meta, texte libre sinon ; validation E.164 client
