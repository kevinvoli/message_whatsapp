# Backlog — Intégration HSM Templates & Outbound Init (master)

**Date :** 2026-04-30  
**Mis à jour :** 2026-05-08  
**Branche cible :** `master`  
**Règle absolue :** ne pas commiter — attendre l'instruction explicite de l'utilisateur

---

## Contexte

La branche `production` contient une implémentation complète de deux fonctionnalités :

1. **Outbound Init** — Envoyer un premier message à un contact non enregistré sur la plateforme, en choisissant le canal
2. **Templates HSM** — Créer, soumettre à Meta, valider via webhook, et envoyer des messages template (désactivé par défaut via `HSM_TEMPLATES_ENABLED = false`)

L'implémentation actuelle sur `master` est incorrecte (schéma de données différent, fonctionnalités manquantes). Ce backlog liste les tickets pour aligner fidèlement `master` sur `production`.

---

## Tableau de bord

| Ticket | Titre | Statut |
|--------|-------|--------|
| B1 | Remplacer l'entité `WhatsappTemplate` | ✅ Livré |
| B2 | Remplacer le service `WhatsappTemplateService` | ✅ Livré |
| B3 | Mettre à jour le module `WhatsappTemplateModule` | ✅ Livré |
| B4 | Remplacer les DTOs create/update template | ✅ Livré |
| B5 | Corriger les endpoints dans `WhatsappMessageController` | ✅ Livré |
| B6 | Réécrire `createOutboundInitMessage` dans `WhatsappMessageService` | ✅ Livré |
| B7 | Corriger `findOrCreateChatForOutbound` dans `WhatsappChatService` | ✅ Livré |
| B8 | Ajouter `sendTemplateMessage` dans `OutboundRouterService` | ✅ Livré |
| B9 | Ajouter `sendTemplateMessage` dans `CommunicationMetaService` | ✅ Livré |
| B10 | Ajouter `sendHsmToWhapiChannel` dans `CommunicationWhapiService` | ✅ Livré |
| B11 | Mettre à jour `WhapiController` (webhook status update) | ✅ Livré |
| B12 | Mettre à jour `WhapiModule` | ✅ Livré |
| B13 | Mettre à jour `DispatcherModule` | ✅ Livré |
| B14 | Remplacer la migration `20260430_outbound_hsm_v1` | ✅ Livré |
| B15 | Corriger le DTO `CreateOutboundMessageDto` | ✅ Livré |
| A1 | Mettre à jour `definitions.ts` | ✅ Livré |
| A2 | Mettre à jour `conversations.api.ts` | ✅ Livré |
| A3 | Mettre à jour `templates.api.ts` | ✅ Livré |
| A4 | Remplacer `OutboundMessageModal.tsx` | ✅ Livré |
| A5 | Vérifier `ConversationsView.tsx` | ✅ Livré |

**Progression : 20/20 tickets livrés · npx tsc --noEmit → 0 erreur**

---

## Tickets Backend

### B1 — Remplacer l'entité `WhatsappTemplate` · ✅ LIVRÉ
**Fichier :** `message_whatsapp/src/whatsapp_template/entities/whatsapp_template.entity.ts`

Schéma aligné sur production :
- `id` (uuid), `channelId`, `name`, `language`, `category`, `status` (enum PENDING/APPROVED/REJECTED), `components` (json), `externalId`, `rejectionReason`, `createdAt`, `updatedAt`
- Relation `@ManyToOne(() => WhapiChannel)` avec `@JoinColumn({ name: 'channel_id' })`
- Export `enum WhatsappTemplateStatus { PENDING, APPROVED, REJECTED }`

---

### B2 — Remplacer le service `WhatsappTemplateService` · ✅ LIVRÉ
**Fichier :** `message_whatsapp/src/whatsapp_template/whatsapp_template.service.ts`

Méthodes implémentées :
- `findAllByChannel(channelId, status?)` — filtre par UUID canal et statut optionnel
- `findOne(id)`, `findByExternalId(externalId)`, `findApprovedByName(channelId, name)`
- `create(dto)` — soumet à Meta si `provider === 'meta'`, sinon APPROVED directement
- `updateStatusByExternalId(externalId, status, rejectionReason?)` — appelé par webhook
- `resubmit(id, updates?)` — vérifie REJECTED + provider meta, resoumet
- `submitToMeta(data, channel)` — POST Meta Graph API, extrait l'id retourné
- Cache Redis préservé (Sprint E-02) : `template:id:{id}` TTL 300s, `template:approved:{channelId}:{name}` TTL 300s

---

### B3 — Mettre à jour `WhatsappTemplateModule` · ✅ LIVRÉ
`WhapiChannel` dans `TypeOrmModule.forFeature`, `LoggingModule` importé, `TypeOrmModule` exporté.

---

### B4 — Remplacer les DTOs · ✅ LIVRÉ
- `CreateWhatsappTemplateDto` : `channelId`, `name`, `language?`, `category?`, `status?`, `components?`, `externalId?`
- `UpdateWhatsappTemplateDto` (nouveau) : `name?`, `language?`, `category?`, `components?`

---

### B5 — Corriger les endpoints `WhatsappMessageController` · ✅ LIVRÉ
- `GET /messages/templates` : param `channel_id` (UUID WhapiChannel), appel `findAllByChannel`
- `POST /messages/templates` : passe dto directement à `templateService.create(dto)`
- `PATCH /messages/templates/:id/resubmit` : body `UpdateWhatsappTemplateDto`
- `POST /messages/outbound-init` : passe `text?`, `templateId?`, `templateParams?`, `contactName?`

---

### B6 — Réécrire `createOutboundInitMessage` · ✅ LIVRÉ
**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.service.ts`

Signature : `createOutboundInitMessage(data: { channelId, recipient, text?, templateId?, templateParams?, contactName? }): Promise<{ chatId, messageId, contactId }>`

Flux : validation → charger canal → valider E.164 → construire `chat_id` selon provider → `findOrCreate` contact + chat → envoyer (template ou texte) → persister message → retourner `{ chatId, messageId, contactId }`

---

### B7 — Corriger `findOrCreateChatForOutbound` · ✅ LIVRÉ
Signature objet `{ chat_id, contactName, channelId }`, `status: EN_ATTENTE`, `contact_client: chat_id.split('@')[0]`.

---

### B8 — `sendTemplateMessage` dans `OutboundRouterService` · ✅ LIVRÉ
Route vers `metaService.sendTemplateMessage()` ou `whapiService.sendHsmToWhapiChannel()` selon `provider`.

---

### B9 — `sendTemplateMessage` dans `CommunicationMetaService` · ✅ LIVRÉ
POST `https://graph.facebook.com/{META_API_VERSION}/{phoneNumberId}/messages` avec payload type `template`. Retry sur erreurs transitoires.

---

### B10 — `sendHsmToWhapiChannel` dans `CommunicationWhapiService` · ✅ LIVRÉ
POST `https://gate.whapi.cloud/messages/hsm` avec payload HSM Whapi. Retry sur erreurs transitoires.

---

### B11 — Mettre à jour `WhapiController` · ✅ LIVRÉ
- Détection `field === 'message_template_status_update'` avant traitement normal
- Appel `handleTemplateStatusUpdate(rawChange.value)` — fire & forget
- `handleTemplateStatusUpdate()` : `updateStatusByExternalId()` + émission WebSocket `admin:template_status_update`

---

### B12 — Mettre à jour `WhapiModule` · ✅ LIVRÉ
`WhatsappTemplateModule` ajouté aux imports.

---

### B13 — Mettre à jour `DispatcherModule` · ✅ LIVRÉ
`WhatsappTemplateModule` ajouté aux imports.

---

### B14 — Remplacer la migration · ✅ LIVRÉ
`20260430_outbound_hsm_v1.ts` : DDL `CREATE TABLE IF NOT EXISTS whatsapp_template` avec schéma production complet.
`20260430_outbound_hsm_v2.ts` : supprimé (la colonne `rejection_reason` était déjà dans v1).

---

### B15 — Corriger `CreateOutboundMessageDto` · ✅ LIVRÉ
Champs : `channel_id`, `recipient`, `text?`, `template_id?`, `template_params?`, `contact_name?` avec class-validator.

---

## Tickets Frontend Admin

### A1 — Mettre à jour `definitions.ts` · ✅ LIVRÉ
Type `WhatsappTemplate` camelCase : `id`, `channelId`, `name`, `language`, `category?`, `status: WhatsappTemplateStatus`, `components?`, `externalId?`, `rejectionReason?`, `createdAt`, `updatedAt`.

---

### A2 — Mettre à jour `conversations.api.ts` · ✅ LIVRÉ
`initiateOutboundConversation` retourne `{ chatId, messageId, contactId }` (camelCase).

---

### A3 — Mettre à jour `templates.api.ts` · ✅ LIVRÉ
`getWhatsappTemplates(channelId, status?)` utilise `channel_id` (UUID WhapiChannel). Fonctions legacy supprimées.

---

### A4 — Remplacer `OutboundMessageModal.tsx` · ✅ LIVRÉ
- `ProviderInlineBadge` inline
- `isTemplateMode = selectedChannel?.provider === 'meta'`
- Mode Meta : sélecteur templates APPROVED, aperçu body, champs paramètres `{{1}}` `{{2}}`
- Mode Whapi/autres : textarea texte libre
- Validation E.164 côté client, placeholder adaptatif
- `onSuccess(result.chatId)` camelCase

---

### A5 — Vérifier `ConversationsView.tsx` · ✅ LIVRÉ
`onSuccess(_chatId: string) => { setShowOutboundModal(false); void loadChats(limit, offset); }` — recharge la liste après outbound init.

---

## Critères de validation

- [x] `npx tsc --noEmit` → 0 erreur backend
- [x] `npx tsc --noEmit` → 0 nouvelle erreur admin
- [ ] `POST /messages/outbound-init` avec texte libre → message envoyé, chat créé, retourne `{ chatId, messageId, contactId }` ← **à valider en staging**
- [ ] `POST /messages/templates` sur canal Whapi → template créé status `APPROVED`
- [ ] `POST /messages/templates` sur canal Meta → appel Meta API, status `PENDING`, `externalId` stocké
- [ ] `PATCH /messages/templates/:id/resubmit` sur template `REJECTED` → status `PENDING`, `externalId` mis à jour
- [ ] Webhook `message_template_status_update` → statut mis à jour + WebSocket `admin:template_status_update`
- [ ] `HSM_TEMPLATES_ENABLED = false` → endpoints templates retournent `404`, outbound-init fonctionnel
- [ ] Modal outbound : mode template si Meta, texte libre sinon ; validation E.164

---

*Backlog mis à jour le 2026-05-08 · 20/20 tickets livrés · Validation fonctionnelle restante en staging*
