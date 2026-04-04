# Cahier des Charges — Webhooks Meta & Fonctionnalités CRM

> Basé sur l'audit complet du code effectué le 2026-04-03.
> Ce document liste les fonctionnalités à implémenter, classées par **priorité** puis **pertinence métier**.
> Chaque item est autonome et peut être assigné indépendamment.
>
> **Deux parties** :
> - **Partie I** — Webhooks Meta (événements temps réel)
> - **Partie II** — Fonctionnalités CRM (manquantes ou partielles selon audit)

---

## Sommaire

### Partie I — Webhooks Meta
- [🔴 CRITIQUE](#-critique)
  - [C-1 · Désactivation de compte — `account_update` + `business_status_update`](#c-1--désactivation-de-compte--account_update--business_status_update)
  - [C-2 · Messages d'erreur lisibles — statut `failed`](#c-2--messages-derreur-lisibles--statut-failed)
- [🟠 HAUTE](#-haute)
  - [H-1 · Brancher le handler `message_template_status_update`](#h-1--brancher-le-handler-message_template_status_update)
  - [H-2 · Qualité et tier du numéro — `phone_number_quality_update`](#h-2--qualité-et-tier-du-numéro--phone_number_quality_update)
  - [H-3 · Alertes préventives — `account_alerts`](#h-3--alertes-préventives--account_alerts)
  - [H-4 · Origine publicitaire — `referral`](#h-4--origine-publicitaire--referral)
- [🟡 MOYENNE](#-moyenne)
  - [M-1 · Réactions emoji — `reaction`](#m-1--réactions-emoji--reaction)
  - [M-2 · Appels manqués — `calls`](#m-2--appels-manqués--calls)
  - [M-3 · Opt-in/opt-out RGPD — `user_preferences`](#m-3--optinoptout-rgpd--user_preferences)
  - [M-4 · Changement de numéro client — `system`](#m-4--changement-de-numéro-client--system)
  - [M-5 · Qualité des templates — `message_template_quality_update`](#m-5--qualité-des-templates--message_template_quality_update)
  - [M-6 · WhatsApp Flows — `flows` + `nfm_reply`](#m-6--whatsapp-flows--flows--nfm_reply)
- [🟢 BASSE](#-basse)
  - [B-1 · Fiches contact partagées — `contacts`](#b-1--fiches-contact-partagées--contacts)
  - [B-2 · Placeholder type inconnu — `unsupported`](#b-2--placeholder-type-inconnu--unsupported)
  - [B-3 · Audit log des envois — `message_echoes`](#b-3--audit-log-des-envois--message_echoes)
  - [B-4 · Recatégorisation templates — `template_category_update`](#b-4--recatégorisation-templates--template_category_update)
  - [B-5 · Analytics campagnes — `tracking_events`](#b-5--analytics-campagnes--tracking_events)
  - [B-6 · Migration d'historique — `history`](#b-6--migration-dhistorique--history)

### Partie II — Fonctionnalités CRM

- [🔴 CRM CRITIQUE](#-crm-critique)
  - [CR-1 · Recherche contacts & conversations](#cr-1--recherche-contacts--conversations)
  - [CR-2 · Notes sur les conversations](#cr-2--notes-sur-les-conversations)
  - [CR-3 · Champs contact manquants (email, entreprise, adresse)](#cr-3--champs-contact-manquants-email-entreprise-adresse)
  - [CR-4 · Archivage des conversations (endpoint + UI)](#cr-4--archivage-des-conversations-endpoint--ui)
  - [CR-5 · Transfert manuel de conversation entre agents](#cr-5--transfert-manuel-de-conversation-entre-agents)
- [🟠 CRM HAUTE](#-crm-haute)
  - [CH-1 · Rappels et tâches de suivi](#ch-1--rappels-et-tâches-de-suivi)
  - [CH-2 · Réponses rapides (canned responses)](#ch-2--réponses-rapides-canned-responses)
  - [CH-3 · Labels / tags — terminer l'implémentation](#ch-3--labels--tags--terminer-limplémentation)
  - [CH-4 · Notifications pour les agents commerciaux](#ch-4--notifications-pour-les-agents-commerciaux)
  - [CH-5 · Audit trail des modifications](#ch-5--audit-trail-des-modifications)
- [🟡 CRM MOYENNE](#-crm-moyenne)
  - [CM-1 · Pipeline de vente visuel (Kanban)](#cm-1--pipeline-de-vente-visuel-kanban)
  - [CM-2 · Scoring automatique des leads](#cm-2--scoring-automatique-des-leads)
  - [CM-3 · Satisfaction client (CSAT)](#cm-3--satisfaction-client-csat)
  - [CM-4 · Dashboard personnel de l'agent](#cm-4--dashboard-personnel-de-lagent)
  - [CM-5 · Permissions granulaires et rôle Manager](#cm-5--permissions-granulaires-et-rôle-manager)
- [🟢 CRM BASSE](#-crm-basse)
  - [CB-1 · Tags sur les contacts](#cb-1--tags-sur-les-contacts)
  - [CB-2 · Export planifié et filtré](#cb-2--export-planifié-et-filtré)
  - [CB-3 · 2FA pour admin et agents](#cb-3--2fa-pour-admin-et-agents)
  - [CB-4 · Historique multi-canal unifié](#cb-4--historique-multi-canal-unifié)

---

## 🔴 CRITIQUE

> Absence = pannes silencieuses ou perte de données sans aucune alerte.
> À implémenter en premier, avant tout autre développement.

---

### C-1 · Désactivation de compte — `account_update` + `business_status_update`

**Problème** : Si Meta désactive ou restreint le compte WhatsApp Business, tous les envois échouent silencieusement. Personne n'est averti.

**Impact** : Bloquant — aucun message ne peut être envoyé ou reçu.

**Effort estimé** : Moyen (2–3 jours)

---

#### Backend

**1. Ajouter une migration BDD**

```sql
ALTER TABLE provider_channel
  ADD COLUMN meta_account_status      VARCHAR(32)  DEFAULT 'ACTIVE',
  ADD COLUMN meta_account_status_note VARCHAR(255) DEFAULT NULL,
  ADD COLUMN meta_account_status_at   DATETIME     DEFAULT NULL;
```

**2. Créer le handler dans `WebhookController`**

Fichier : `message_whatsapp/src/whapi/webhook.controller.ts`

```typescript
// Dans la méthode POST /webhooks/meta/:channelId
// Après la validation HMAC existante, ajouter :
const field = change.field;

if (field === 'account_update') {
  await this.metaAccountService.handleAccountUpdate(channelId, change.value);
  return;
}
if (field === 'business_status_update') {
  await this.metaAccountService.handleBusinessStatusUpdate(change.value);
  return;
}
```

**3. Créer `MetaAccountService`**

Fichier : `message_whatsapp/src/whapi/meta-account.service.ts`

```typescript
@Injectable()
export class MetaAccountService {
  async handleAccountUpdate(channelId: string, value: any): Promise<void> {
    const { event, ban_info } = value;
    // Stocker le statut sur le canal
    await this.channelRepository.update(
      { id: channelId },
      {
        meta_account_status: event,       // ex: 'DISABLED_ACCOUNT'
        meta_account_status_note: ban_info?.text ?? null,
        meta_account_status_at: new Date(),
      }
    );
    // Émettre une alerte WebSocket vers l'admin
    await this.gateway.emitMetaAccountAlert({ channelId, event, ban_info });
  }

  async handleBusinessStatusUpdate(value: any): Promise<void> {
    const { status } = value; // 'DISABLED' | 'RESTRICTED' | 'ACTIVE'
    // Stocker + alerter
  }
}
```

**4. Bloquer les envois sortants si `meta_account_status` est `DISABLED_ACCOUNT` ou `BANNED_ACCOUNT`**

Dans `OutboundRouterService.sendViaMetaApi()` :
```typescript
if (['DISABLED_ACCOUNT', 'BANNED_ACCOUNT'].includes(channel.meta_account_status)) {
  throw new Error(`Canal Meta désactivé (${channel.meta_account_status}) — envoi bloqué`);
}
```

#### Admin (`admin/`)

**5. Bannière d'alerte critique**

Fichier : `admin/src/app/ui/layout/AdminLayout.tsx` (ou équivalent)

```tsx
// Afficher si meta_account_status !== 'ACTIVE'
{channel.meta_account_status !== 'ACTIVE' && (
  <div className="bg-red-600 text-white p-3 text-center font-semibold">
    🔴 COMPTE META {channel.meta_account_status} — Les envois sont bloqués.
    {channel.meta_account_status_note && ` Raison : ${channel.meta_account_status_note}`}
  </div>
)}
```

**6. Indicateur de statut dans la page des canaux**

Afficher `meta_account_status` avec une pastille colorée (vert/orange/rouge) par canal.

---

### C-2 · Messages d'erreur lisibles — statut `failed`

**Problème** : Les codes d'erreur Meta sont sauvegardés en base (`error_code`, `error_message` dans `whatsapp_message`), mais `ChatMessage.tsx` affiche seulement "❌ Échec" sans contexte.

**Impact** : L'agent commercial ne sait pas pourquoi le message n'est pas parti et ne peut pas prendre d'action corrective (utiliser un template, renvoyer le fichier, etc.).

**Effort estimé** : Faible (0,5–1 jour) — frontend uniquement.

---

#### Frontend (`front/`)

**1. Créer le mapping des codes d'erreur**

Fichier : `front/src/lib/metaErrorCodes.ts` (nouveau fichier)

```typescript
export const META_ERROR_LABELS: Record<number, { label: string; action?: string }> = {
  131026: { label: "Numéro non joignable sur WhatsApp" },
  131047: { label: "Fenêtre 24h expirée", action: "Utilisez un template pour recontacter ce client" },
  131048: { label: "Message signalé comme spam par le destinataire" },
  131051: { label: "Type de message non supporté par ce destinataire" },
  131052: { label: "Fichier média expiré", action: "Renvoyez le fichier" },
  130429: { label: "Limite de débit Meta atteinte", action: "Réessayez dans quelques minutes" },
  131000: { label: "Erreur interne Meta", action: "Réessayez" },
  100:    { label: "Paramètre invalide (numéro de téléphone incorrect ?)" },
};

export function getMetaErrorLabel(code?: number | null): string | null {
  if (!code) return null;
  const entry = META_ERROR_LABELS[code];
  if (!entry) return `Erreur Meta #${code}`;
  return entry.action ? `${entry.label} — ${entry.action}` : entry.label;
}
```

**2. Afficher dans `ChatMessage.tsx`**

Fichier : `front/src/components/chat/ChatMessage.tsx`

```tsx
// Dans le rendu du message avec status === 'error' ou 'failed'
{message.status === 'error' && (
  <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
    <span>❌</span>
    <span>{getMetaErrorLabel(message.error_code) ?? 'Message non délivré'}</span>
  </div>
)}
```

**3. S'assurer que `error_code` est inclus dans les réponses API**

Vérifier que le DTO/serializer de `WhatsappMessage` expose `error_code` et `error_message` dans les endpoints `/messages` et dans les événements WebSocket `MESSAGE_STATUS_UPDATE`.

---

## 🟠 HAUTE

> Impact métier important. Leur absence crée des pertes d'information ou des risques opérationnels.

---

### H-1 · Brancher le handler `message_template_status_update`

**Problème** : Ce webhook est **déjà souscrit** dans `meta-token.service.ts` (L229) mais il est ignoré lors de la réception — aucun handler dans le contrôleur.

**Impact** : Un template `PAUSED` ou `DISABLED` fait échouer silencieusement tous les `MessageAuto` qui l'utilisent.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Ajouter une table `message_template`** (si elle n'existe pas)

```sql
CREATE TABLE IF NOT EXISTS message_template (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  channel_id     VARCHAR(36)  NOT NULL,
  template_id    BIGINT       NOT NULL,
  name           VARCHAR(255) NOT NULL,
  language       VARCHAR(10)  NOT NULL DEFAULT 'fr',
  status         VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
  quality_score  VARCHAR(10)  DEFAULT NULL,
  rejection_reason VARCHAR(100) DEFAULT NULL,
  updatedAt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template (channel_id, template_id)
);
```

**2. Créer le handler dans `WebhookController`**

```typescript
if (field === 'message_template_status_update') {
  await this.metaTemplateService.handleStatusUpdate(change.value);
  return;
}
```

**3. Créer `MetaTemplateService.handleStatusUpdate()`**

```typescript
async handleStatusUpdate(value: {
  event: 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'FLAGGED';
  message_template_id: number;
  message_template_name: string;
  message_template_language: string;
  reason?: string;
}): Promise<void> {
  // Upsert dans message_template
  await this.templateRepository.upsert({
    template_id: value.message_template_id,
    name: value.message_template_name,
    language: value.message_template_language,
    status: value.event,
    rejection_reason: value.reason ?? null,
  }, ['template_id']);

  // Si PAUSED ou DISABLED : désactiver les MessageAuto qui utilisent ce template
  if (['PAUSED', 'DISABLED'].includes(value.event)) {
    await this.messageAutoRepository.update(
      { template_name: value.message_template_name },
      { enabled: false }
    );
    this.logger.warn(`Template "${value.message_template_name}" → ${value.event} — MessageAuto désactivés`);
  }
}
```

**4. Guard dans l'envoi de templates**

Dans `MessageAutoService` ou `OutboundRouterService`, avant d'envoyer :
```typescript
const template = await this.templateRepository.findOne({ where: { name: templateName } });
if (template && ['PAUSED', 'DISABLED'].includes(template.status)) {
  throw new Error(`Template "${templateName}" est ${template.status} — envoi bloqué`);
}
```

#### Admin

**5. Page de gestion des templates**

- Tableau listant les templates avec leur statut (badge coloré : vert/orange/rouge)
- Filtre par statut
- Alerte en temps réel (WebSocket) si un template change de statut

---

### H-2 · Qualité et tier du numéro — `phone_number_quality_update`

**Problème** : Si le tier descend (`TIER_10K` → `TIER_1K`), les campagnes d'envoi massif sont brutalement limitées sans avertissement interne.

**Impact** : Capacité d'envoi réduite sans que l'admin soit prévenu.

**Effort estimé** : Faible (1 jour)

---

#### Backend

**1. Ajouter colonnes sur `provider_channel`**

```sql
ALTER TABLE provider_channel
  ADD COLUMN meta_messaging_tier    VARCHAR(20) DEFAULT NULL,
  ADD COLUMN meta_quality_status    VARCHAR(20) DEFAULT NULL,
  ADD COLUMN meta_tier_updated_at   DATETIME    DEFAULT NULL;
```

**2. Handler dans `WebhookController`**

```typescript
if (field === 'phone_number_quality_update') {
  await this.metaAccountService.handleQualityUpdate(channelId, change.value);
  return;
}
```

**3. Stocker + alerter**

```typescript
async handleQualityUpdate(channelId: string, value: any): Promise<void> {
  const { current_limit, event } = value;
  // ex: event = 'FLAGGED' | 'UNFLAGGED', current_limit = 'TIER_1K'
  await this.channelRepository.update(
    { id: channelId },
    { meta_messaging_tier: current_limit, meta_quality_status: event, meta_tier_updated_at: new Date() }
  );
  if (['FLAGGED', 'TIER_1K', 'TIER_250'].includes(event ?? current_limit)) {
    await this.gateway.emitAdminAlert({ type: 'QUALITY_DEGRADED', channelId, current_limit, event });
  }
}
```

#### Admin

**4. Afficher dans la page du canal**

```
Canal WhatsApp +213 XX XX XX XX
├── Statut compte : ✅ Actif
├── Tier messagerie : TIER_10K  (10 000 conv./jour)
└── Qualité : 🟢 Bonne
```

---

### H-3 · Alertes préventives — `account_alerts`

**Problème** : Meta envoie des alertes préventives avant d'imposer une restriction. Sans handler, ces alertes sont perdues.

**Impact** : L'admin ne peut pas agir avant la restriction (trop de signalements, usage suspect, etc.).

**Effort estimé** : Faible (0,5–1 jour)

---

#### Backend

**1. Handler dans `WebhookController`**

```typescript
if (field === 'account_alerts') {
  await this.metaAccountService.handleAccountAlert(channelId, change.value);
  return;
}
```

**2. Logger + émettre WebSocket vers l'admin**

```typescript
async handleAccountAlert(channelId: string, value: {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  notification_type: string;
  event_timestamp: string;
  related_event_uri?: string;
}): Promise<void> {
  this.logger.warn(`Meta account alert [${value.severity}]: ${value.notification_type} — canal ${channelId}`);
  // Insérer en base (table notifications)
  // Émettre vers l'admin via WebSocket
  await this.gateway.emitAdminAlert({ type: 'ACCOUNT_ALERT', ...value, channelId });
}
```

#### Admin

**3. Centre de notifications Meta**

- Afficher les alertes non lues dans la navbar admin (badge)
- Liste des alertes avec sévérité, date, type d'événement

---

### H-4 · Origine publicitaire — `referral`

**Problème** : Quand un client démarre une conversation via une pub Facebook/Instagram (Click-to-WhatsApp), le champ `referral` sur le premier message est perdu — `MetaMessageBase` ne le contient pas.

**Impact** : ROI publicitaire non mesurable dans l'application. Impossibilité de savoir quelle pub génère des conversions.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Ajouter `referral` dans `MetaMessageBase`**

Fichier : `message_whatsapp/src/whapi/interface/whatsapp-whebhook.interface.ts`

```typescript
export interface MetaReferral {
  source_url:  string;
  source_type: 'ad' | 'post' | 'unknown';
  source_id:   string;
  headline?:   string;
  body?:       string;
  media_type?: string;
  image_url?:  string;
}

export interface MetaMessageBase {
  // ... champs existants ...
  referral?: MetaReferral;
}
```

**2. Ajouter colonnes sur `whatsapp_chat`**

```sql
ALTER TABLE whatsapp_chat
  ADD COLUMN referral_source_url  VARCHAR(500) DEFAULT NULL,
  ADD COLUMN referral_source_type VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN referral_source_id   VARCHAR(255) DEFAULT NULL,
  ADD COLUMN referral_headline    VARCHAR(500) DEFAULT NULL;
```

**3. Sauvegarder dans `MetaAdapter` ou `InboundMessageService`**

```typescript
// Lors du traitement du premier message (chat.referral_source_url IS NULL)
if (message.referral && !chat.referral_source_url) {
  await this.chatRepository.update(chat.id, {
    referral_source_url:  message.referral.source_url,
    referral_source_type: message.referral.source_type,
    referral_source_id:   message.referral.source_id,
    referral_headline:    message.referral.headline ?? null,
  });
}
```

#### Frontend Commercial

**4. Bannière "Vient d'une pub" dans la conversation**

Fichier : `front/src/components/chat/ConversationHeader.tsx` (ou équivalent)

```tsx
{conversation.referral_source_url && (
  <div className="bg-blue-50 border-l-4 border-blue-400 px-3 py-2 text-sm">
    📢 Ce client vient d'une publicité
    {conversation.referral_headline && <> : <em>{conversation.referral_headline}</em></>}
  </div>
)}
```

#### Admin

**5. Statistiques par source dans les métriques**

- Tableau "Conversations par origine" : Organique / [Nom campagne A] / [Nom campagne B]
- Filtrable par période dans le dashboard existant (`MetriquesService`)

---

## 🟡 MOYENNE

> Améliorent significativement l'expérience ou la conformité. Non bloquants à court terme.

---

### M-1 · Réactions emoji — `reaction`

**Problème** : `type: "reaction"` n'est pas géré côté Meta. `InstagramAdapter` ignore explicitement les réactions (L31 : `if (messaging.message.reactions) continue;`).

**Impact** : Signal d'approbation/désaccord du client perdu. L'agent ne sait pas si sa réponse a été bien reçue.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Ajouter une table `message_reaction`**

```sql
CREATE TABLE IF NOT EXISTS message_reaction (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  message_id  VARCHAR(255) NOT NULL,  -- wamid du message réagi
  chat_id     VARCHAR(255) NOT NULL,
  from_phone  VARCHAR(50)  NOT NULL,
  emoji       VARCHAR(10)  NOT NULL,  -- '' si retrait
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reaction (message_id, from_phone)
);
```

**2. Gérer dans `MetaAdapter`**

```typescript
// Dans mapMessage() ou une méthode dédiée
if (raw.type === 'reaction') {
  return {
    type: 'reaction',
    reaction: {
      message_id: raw.reaction.message_id,
      emoji: raw.reaction.emoji,  // '' = retrait
    },
  };
}
```

**3. Dans `InboundMessageService`**

```typescript
if (message.type === 'reaction') {
  await this.reactionRepository.upsert({
    message_id: message.reaction.message_id,
    chat_id: chat.chat_id,
    from_phone: message.from,
    emoji: message.reaction.emoji,
  }, ['message_id', 'from_phone']);
  await this.gateway.emitReactionUpdate({ chatId: chat.chat_id, ...message.reaction });
  return; // Pas de nouveau message à créer
}
```

**4. Retirer l'ignore dans `InstagramAdapter`**

```typescript
// Remplacer :
if (messaging.message.reactions) continue;
// Par le même traitement que Meta (réactions Instagram)
```

#### Frontend

**5. Afficher les réactions dans `ChatMessage.tsx`**

```tsx
{message.reactions?.length > 0 && (
  <div className="flex gap-1 mt-1">
    {message.reactions.map(r => (
      <span key={r.from_phone} className="text-sm bg-gray-100 rounded-full px-1">{r.emoji}</span>
    ))}
  </div>
)}
```

---

### M-2 · Appels manqués — `calls`

**Problème** : Si un client appelle et tombe sur personne, l'agent ne le sait pas et ne peut pas le rappeler.

**Impact** : Expérience client dégradée, leads perdus silencieusement.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Souscrire au webhook `calls`** (dans `meta-token.service.ts`)

**2. Handler dans `WebhookController`**

```typescript
if (field === 'calls') {
  await this.callsService.handleIncomingCall(channelId, change.value);
  return;
}
```

**3. Créer `CallsService`**

```typescript
async handleIncomingCall(channelId: string, value: {
  from: string;
  call_status: 'missed' | 'answered' | 'ringing' | 'hung_up';
  call_id: string;
  timestamp: string;
}): Promise<void> {
  if (value.call_status === 'missed') {
    // Trouver le chat correspondant au numéro `from`
    const chat = await this.chatRepository.findOne({ where: { contact_client: value.from } });
    // Créer un message système "Appel manqué" dans la conversation
    await this.messageRepository.save({
      chat_id: chat?.chat_id,
      type: 'call_missed',
      body: 'Appel manqué',
      from_me: false,
      timestamp: new Date(parseInt(value.timestamp) * 1000),
    });
    // Notifier l'agent en temps réel
    await this.gateway.emitNewMessage({ chatId: chat?.chat_id });
  }
}
```

#### Frontend

**4. Afficher dans `ChatMessage.tsx`**

```tsx
{message.type === 'call_missed' && (
  <div className="flex items-center gap-2 text-orange-600 italic text-sm">
    📞 Appel manqué
  </div>
)}
```

---

### M-3 · Opt-in/opt-out RGPD — `user_preferences`

**Problème** : Si un client se désinscrit des messages marketing, l'application continue à lui envoyer des templates MARKETING — violation RGPD.

**Impact** : Conformité légale + risque de signalements → dégradation de la qualité du numéro.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Ajouter colonnes sur `contact` (ou table dédiée)**

```sql
ALTER TABLE contact
  ADD COLUMN marketing_opt_in  TINYINT(1) DEFAULT 1,
  ADD COLUMN messaging_opt_in  TINYINT(1) DEFAULT 1,
  ADD COLUMN opt_updated_at    DATETIME   DEFAULT NULL;
```

**2. Handler + sauvegarder les préférences**

**3. Bloquer les envois MARKETING aux contacts opt-out**

Dans `MessageAutoService` ou `OutboundRouterService` :
```typescript
if (template.category === 'MARKETING' && contact.marketing_opt_in === false) {
  this.logger.warn(`Envoi bloqué — contact opt-out marketing (${contact.phone})`);
  return;
}
```

#### Frontend Commercial

**4. Afficher dans la fiche contact**

```
📢 Opt-in marketing : 🚫 Refusé (depuis le 01/03/2026)
```

---

### M-4 · Changement de numéro client — `system`

**Problème** : Quand un client change de numéro WhatsApp, deux contacts distincts existent en base pour la même personne — historique fragmenté.

**Impact** : Doublons de contacts, perte d'historique, assignation incorrecte.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Gérer dans `MetaAdapter` ou `InboundMessageService`**

```typescript
if (raw.type === 'system' && raw.system?.type === 'user_changed_number') {
  const oldPhone = raw.from;
  const newPhone = raw.system.new_wa_id;
  await this.contactService.mergePhoneNumbers(oldPhone, newPhone);
  // Créer un message système dans la conversation
}
```

**2. `ContactService.mergePhoneNumbers()`**

- Chercher les contacts avec `oldPhone` et `newPhone`
- Fusionner (ou créer un lien) entre les deux
- Mettre à jour `contact_client` sur les chats de l'ancien numéro

#### Frontend

**3. Message informatif dans la conversation**

```
⚙️ Ce contact a changé de numéro WhatsApp.
   Ancien : +213 50 XXX XXX → Nouveau : +213 55 XXX XXX
```

---

### M-5 · Qualité des templates — `message_template_quality_update`

**Problème** : La qualité d'un template peut descendre en YELLOW puis RED avant sa suspension. Sans ce webhook, aucun avertissement précoce.

**Impact** : Templates suspendus sans préavis interne → `MessageAuto` en échec.

**Effort estimé** : Faible (0,5 jour) — extension de H-1

---

**Prérequis** : H-1 (table `message_template`) doit être fait en premier.

#### Backend

**Handler dans `WebhookController`**

```typescript
if (field === 'message_template_quality_update') {
  const { message_template_id, previous_quality_score, new_quality_score } = change.value;
  await this.templateRepository.update(
    { template_id: message_template_id },
    { quality_score: new_quality_score }
  );
  if (['YELLOW', 'RED'].includes(new_quality_score)) {
    await this.gateway.emitAdminAlert({
      type: 'TEMPLATE_QUALITY_DEGRADED',
      template_id: message_template_id,
      from: previous_quality_score,
      to: new_quality_score,
    });
  }
}
```

#### Admin

Afficher le score qualité (🟢 / 🟡 / 🔴) dans le tableau des templates (extension de H-1).

---

### M-6 · WhatsApp Flows — `flows` + `nfm_reply`

**Problème** : Les formulaires WhatsApp Flows (prise de RDV, qualification) ne sont pas gérés. Les réponses (`nfm_reply`) arrivent mais sont ignorées.

**Impact** : Impossible d'utiliser les Flows Meta pour structurer les données client.

**Effort estimé** : Élevé (3–5 jours)

---

#### Backend

**1. Gérer `interactive.type: "nfm_reply"` dans `MetaAdapter`**

```typescript
case 'nfm_reply':
  return {
    type: 'flow_response',
    body: `[Formulaire rempli]`,
    flow_data: interactive.nfm_reply?.response_json
      ? JSON.parse(interactive.nfm_reply.response_json)
      : null,
  };
```

**2. Sauvegarder les données du Flow en base**

Créer une table `flow_response` pour stocker les données structurées.

#### Frontend Commercial

**3. Afficher le résumé du formulaire rempli**

```
📋 Formulaire rempli
├── Prénom : Ahmed
├── Disponibilité : Lundi 14h
└── Objet : Demande de devis
```

#### Admin

**4. Gestion des Flows actifs** (statuts PUBLISHED / DEPRECATED / BLOCKED / THROTTLED)

---

## 🟢 BASSE

> Améliorations cosmétiques ou cas d'usage secondaires. À implémenter après les priorités hautes.

---

### B-1 · Fiches contact partagées — `contacts`

**Champ** : `messages` → `type: "contacts"`

**Affichage à implémenter** dans `ChatMessage.tsx` :
```
👤 Jean Dupont
   📱 +33 6 12 34 56 78
   [Copier le numéro]
```

**Effort** : Faible (0,5 jour)

---

### B-2 · Placeholder type inconnu — `unsupported`

**Champ** : `messages` → `type: "unsupported"`

Au lieu de "❓ Message de type inconnu", afficher :
```
⚠️ Type de message non supporté par cette interface.
   Ouvrez WhatsApp pour voir ce message.
```

**Effort** : Très faible (2h) — modification dans `ChatMessage.tsx`

---

### B-3 · Audit log des envois — `message_echoes`

**Pertinent uniquement si** : plusieurs systèmes envoient des messages au même numéro (CRM externe, dashboard Meta direct, etc.).

**Effort** : Moyen (1–2 jours)

---

### B-4 · Recatégorisation templates — `template_category_update`

Alerter l'admin si un template passe de `UTILITY` (moins cher) à `MARKETING` (plus cher).

**Prérequis** : H-1

**Effort** : Très faible (extension du handler H-1)

---

### B-5 · Analytics campagnes — `tracking_events`

Complète les données `referral` (H-4) avec le suivi post-conversation (clics, conversions).

**Prérequis** : H-4

**Effort** : Élevé — nécessite un pipeline analytics dédié

---

### B-6 · Migration d'historique — `history`

Activer uniquement lors d'une migration de numéro ou d'onboarding d'un client avec un historique existant.

**Effort** : Moyen — ponctuel, pas une fonctionnalité permanente

---

## Ordre d'implémentation recommandé

```
Sprint 1 (critique)
├── C-2 · Codes d'erreur lisibles         (0,5j — quick win, frontend uniquement)
├── C-1 · account_update + business_status (2–3j)
└── H-1 · Brancher message_template_status (1–2j — webhook déjà souscrit !)

Sprint 2 (haute priorité)
├── H-4 · referral (origine pub)           (1–2j)
├── H-2 · phone_number_quality_update      (1j)
└── H-3 · account_alerts                   (0,5j)

Sprint 3 (moyenne priorité)
├── M-1 · reaction                         (1–2j)
├── M-3 · user_preferences (RGPD)          (1–2j)
├── M-5 · template quality (extension H-1) (0,5j)
└── M-4 · system (changement numéro)       (1–2j)

Sprint 4 (moyenne priorité — plus lourd)
├── M-2 · calls (appels manqués)           (1–2j)
└── M-6 · flows + nfm_reply               (3–5j)

Sprint 5 (basse priorité)
├── B-2 · unsupported placeholder          (2h)
├── B-1 · contacts partagés               (0,5j)
├── B-4 · template_category_update        (extension H-1)
└── B-3 / B-5 / B-6 selon besoins métier
```

---

*Partie I — Sources : `MetaAdapter`, `InstagramAdapter`, `MessengerAdapter`, `WebhookController`, `meta-token.service.ts`, `ChatMessage.tsx`.*

---

---

# PARTIE II — Fonctionnalités CRM

> Audit du code effectué le 2026-04-03.
> Cette partie liste les fonctionnalités CRM **manquantes ou partiellement implémentées**.
> Le projet dispose d'une base solide (contacts, conversations, métriques, export) mais plusieurs
> fonctionnalités essentielles d'un CRM de ce niveau sont absentes.

---

## État du socle existant (synthèse audit)

| Domaine | État | Notes |
|---------|------|-------|
| Contacts CRUD | ✅ Complet | Statut appel, priorité, conversion, CallLog |
| Conversations | ✅ Complet | Statuts, SLA, assignation auto, archivage (champ seul) |
| Historique messages | ✅ Complet | Direction, statut, timestamp, commercial |
| Historique appels | ✅ Complet | `CallLog` : résultat, durée, notes, commercial |
| Métriques admin | ✅ Complet | KPIs par agent, poste, canal, période |
| Export données | ✅ Complet | CSV, Excel, JSON, PDF — 8 vues |
| Multi-canal | ✅ Complet | WhatsApp, Meta, Instagram, Messenger, Telegram |
| Notifications admin | ✅ Complet | SSE + WebSocket |
| Labels/tags | ⚠️ Partiel | Entité + gateway — service non implémenté |
| Pipeline de vente | ⚠️ Partiel | 4 statuts fixes, pas de visuel |
| Champs contact | ⚠️ Partiel | Manque email, entreprise, adresse |
| Recherche | ⚠️ Minimal | Par ID uniquement, pas de fulltext |
| Canned responses | ❌ Absent | Module retiré (traces en `dist/` uniquement) |
| Rappels/tâches | ❌ Absent | Aucune table, aucun endpoint |
| Notes conversations | ❌ Absent | Seulement sur appels |
| Transfert entre agents | ❌ Absent | Dispatch auto uniquement |
| Notifications agents | ❌ Absent | Seulement admin |
| Audit trail | ❌ Absent | Aucune trace de "qui a changé quoi" |
| Archivage UI | ❌ Absent | Champ `is_archived` existe, pas d'endpoint |
| Scoring leads | ❌ Absent | — |
| CSAT / satisfaction | ❌ Absent | — |

---

## 🔴 CRM CRITIQUE

> Ces lacunes impactent directement le flux de travail quotidien des agents et la qualité des données CRM.

---

### CR-1 · Recherche contacts & conversations

**Problème** : La seule recherche disponible est par `chat_id` exact. Il est impossible de chercher un contact par nom, téléphone, ou de chercher dans le contenu des messages.

**Impact** : Un agent reçoit un appel d'un client sans savoir son `chat_id` — il ne peut pas retrouver la conversation.

**Effort estimé** : Moyen (2–3 jours)

---

#### Backend

**1. Recherche de contacts par nom/téléphone**

Fichier : `message_whatsapp/src/contact/contact.controller.ts`

```typescript
// Ajouter le query param ?search=
@Get()
async findAll(
  @Query('search') search?: string,
  @Query('limit') limit = 50,
  @Query('offset') offset = 0,
) {
  return this.contactService.findAll(limit, offset, search);
}
```

Fichier : `message_whatsapp/src/contact/contact.service.ts`

```typescript
async findAll(limit = 50, offset = 0, search?: string) {
  const qb = this.contactRepository
    .createQueryBuilder('c')
    .orderBy('c.createdAt', 'DESC')
    .take(limit)
    .skip(offset);

  if (search) {
    qb.where('c.name LIKE :s OR c.phone LIKE :s', { s: `%${search}%` });
  }

  return qb.getManyAndCount();
}
```

**2. Recherche de conversations par nom/téléphone client**

Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`

```typescript
// Ajouter query param ?search= dans GET /chats
if (search) {
  qb.andWhere('chat.name LIKE :s OR chat.contact_client LIKE :s', { s: `%${search}%` });
}
```

**3. Recherche dans le contenu des messages (fulltext)**

```typescript
// Endpoint dédié : GET /messages/search?q=...
@Get('search')
async searchMessages(@Query('q') q: string, @Query('poste_id') posteId?: string) {
  return this.messageRepository
    .createQueryBuilder('m')
    .where('MATCH(m.text) AGAINST (:q IN BOOLEAN MODE)', { q: `*${q}*` })
    .andWhere(posteId ? 'c.poste_id = :posteId' : '1=1', { posteId })
    .innerJoin('whatsapp_chat', 'c', 'c.chat_id = m.chat_id')
    .orderBy('m.timestamp', 'DESC')
    .take(50)
    .getMany();
}
```

> Ajouter l'index FULLTEXT sur `whatsapp_message.text` :
> ```sql
> ALTER TABLE whatsapp_message ADD FULLTEXT INDEX ft_message_text (text);
> ```

#### Frontend Commercial

**4. Barre de recherche dans la sidebar**

Fichier : `front/src/components/sidebar/ConversationList.tsx` (ou équivalent)

- Input de recherche qui filtre en temps réel les conversations affichées
- Si aucun résultat local → appel API `/chats?search=`
- Affichage des résultats avec mise en évidence du terme recherché

#### Admin

**5. Champ de recherche dans `ClientsView.tsx`**

- Input `search` dans l'en-tête du tableau des contacts
- Appel API `GET /contact?search=` à chaque frappe (debounce 300ms)

---

### CR-2 · Notes sur les conversations

**Problème** : Les agents ne peuvent ajouter des notes que sur les appels (via `CallLog.notes`). Il est impossible de laisser une note interne sur une conversation WhatsApp.

**Impact** : Perte d'information entre agents (transfert, contexte, suivi), obligation de tout dire dans les messages visibles par le client.

**Effort estimé** : Faible (1 jour)

---

#### Backend

**1. Ajouter le champ `internal_note` sur `WhatsappChat`**

```sql
ALTER TABLE whatsapp_chat
  ADD COLUMN internal_note TEXT DEFAULT NULL,
  ADD COLUMN internal_note_updated_by VARCHAR(100) DEFAULT NULL,
  ADD COLUMN internal_note_updated_at DATETIME DEFAULT NULL;
```

**2. Endpoint dédié**

Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`

```typescript
@Patch(':chat_id/note')
@UseGuards(AuthGuard('jwt'))
async updateNote(
  @Param('chat_id') chat_id: string,
  @Body('note') note: string,
  @Req() req: any,
) {
  await this.chatService.update(chat_id, {
    internal_note: note,
    internal_note_updated_by: req.user?.name,
    internal_note_updated_at: new Date(),
  });
  return { ok: true };
}
```

#### Frontend Commercial

**3. Afficher la zone de notes dans le panneau latéral de la conversation**

```tsx
// Dans ConversationSidebar ou ContactDetailView
<div className="border rounded p-3">
  <label className="text-xs font-semibold text-gray-500 uppercase">Note interne</label>
  <textarea
    value={internalNote}
    onChange={e => setInternalNote(e.target.value)}
    onBlur={saveNote}
    placeholder="Visible uniquement par l'équipe…"
    className="w-full mt-1 text-sm resize-none"
    rows={3}
  />
  {lastEditor && (
    <p className="text-xs text-gray-400 mt-1">Modifié par {lastEditor}</p>
  )}
</div>
```

---

### CR-3 · Champs contact manquants (email, entreprise, adresse)

**Problème** : L'entité `Contact` n'a pas de champ `email`, `company`, ni `address`. Ces champs sont fondamentaux pour un CRM B2B.

**Impact** : Impossible de contacter le client par email, impossibilité de segmenter par entreprise.

**Effort estimé** : Faible (0,5 jour backend + 0,5 jour frontend)

---

#### Backend

**1. Migration BDD**

```sql
ALTER TABLE contact
  ADD COLUMN email        VARCHAR(255) DEFAULT NULL,
  ADD COLUMN company      VARCHAR(255) DEFAULT NULL,
  ADD COLUMN job_title    VARCHAR(100) DEFAULT NULL,
  ADD COLUMN address      VARCHAR(500) DEFAULT NULL,
  ADD COLUMN city         VARCHAR(100) DEFAULT NULL,
  ADD COLUMN country      VARCHAR(100) DEFAULT NULL;
```

**2. Mettre à jour l'entité TypeORM**

Fichier : `message_whatsapp/src/contact/entities/contact.entity.ts`

```typescript
@Column({ nullable: true }) email?: string;
@Column({ nullable: true }) company?: string;
@Column({ nullable: true }) job_title?: string;
@Column({ nullable: true }) address?: string;
@Column({ nullable: true }) city?: string;
@Column({ nullable: true }) country?: string;
```

**3. Mettre à jour le DTO et le service**

Fichier : `message_whatsapp/src/contact/dto/update-contact.dto.ts`

```typescript
@IsOptional() @IsEmail() email?: string;
@IsOptional() @IsString() company?: string;
@IsOptional() @IsString() job_title?: string;
@IsOptional() @IsString() address?: string;
@IsOptional() @IsString() city?: string;
@IsOptional() @IsString() country?: string;
```

#### Admin + Frontend

**4. Ajouter les champs dans le formulaire de contact (`ClientsView.tsx` et `ContactDetailView.tsx`)**

- Section "Coordonnées" : email + téléphone
- Section "Entreprise" : nom entreprise, poste, ville, pays
- Email cliquable (`mailto:`)

---

### CR-4 · Archivage des conversations (endpoint + UI)

**Problème** : Le champ `is_archived` existe dans `WhatsappChat` mais aucun endpoint ni UI ne permet d'archiver/désarchiver une conversation.

**Impact** : Les agents accumulent des conversations terminées dans leur vue principale — liste encombrée.

**Effort estimé** : Très faible (2–3h)

---

#### Backend

**1. Endpoint d'archivage**

Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`

```typescript
@Patch(':chat_id/archive')
@UseGuards(AuthGuard('jwt'))
async archive(@Param('chat_id') chat_id: string) {
  await this.chatService.update(chat_id, { is_archived: true });
  return { ok: true };
}

@Patch(':chat_id/unarchive')
@UseGuards(AuthGuard('jwt'))
async unarchive(@Param('chat_id') chat_id: string) {
  await this.chatService.update(chat_id, { is_archived: false });
  return { ok: true };
}
```

**2. Exclure les archivées par défaut dans `findByPosteId`**

```typescript
// Dans findByPosteId, ajouter :
qb.andWhere('chat.is_archived = :archived', { archived: false });
```

#### Frontend Commercial

**3. Bouton "Archiver" dans le menu contextuel de la conversation**

- Menu `…` sur chaque conversation → "Archiver"
- Filtre "Archivées" dans la sidebar (comme dans WhatsApp natif)
- Conversations archivées exclues de la vue principale

---

### CR-5 · Transfert manuel de conversation entre agents

**Problème** : Le dispatch est entièrement automatique. Un agent ne peut pas transférer manuellement une conversation à un collègue ou un autre poste.

**Impact** : Si un agent reçoit une conversation hors de sa compétence, il ne peut pas la réassigner — il doit demander au dispatcher ou à l'admin.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Endpoint de transfert**

Fichier : `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`

```typescript
@Patch(':chat_id/transfer')
@UseGuards(AuthGuard('jwt'))
async transfer(
  @Param('chat_id') chat_id: string,
  @Body('poste_id') newPosteId: string,
  @Req() req: any,
) {
  await this.dispatcherService.transferConversation(chat_id, newPosteId, req.user?.id);
  return { ok: true };
}
```

**2. `DispatcherService.transferConversation()`**

```typescript
async transferConversation(chatId: string, newPosteId: string, byCommercialId: string): Promise<void> {
  const newPoste = await this.posteRepository.findOne({ where: { id: newPosteId } });
  if (!newPoste) throw new NotFoundException('Poste introuvable');

  await this.chatRepository.update(
    { chat_id: chatId },
    {
      poste_id: newPosteId,
      status: newPoste.is_active ? WhatsappChatStatus.ACTIF : WhatsappChatStatus.EN_ATTENTE,
      assigned_at: new Date(),
      assigned_mode: newPoste.is_active ? 'ONLINE' : 'OFFLINE',
    }
  );

  // Notifier l'ancien et le nouveau poste via WebSocket
  await this.messageGateway.emitConversationTransferred(chatId, newPosteId);

  this.logger.log(`Conversation ${chatId} transférée vers poste ${newPosteId} par ${byCommercialId}`);
}
```

#### Frontend Commercial

**3. Sélecteur de transfert dans le panneau de la conversation**

```tsx
// Bouton "Transférer" → modal avec liste des postes disponibles
<TransferModal
  chatId={selectedConversation.chat_id}
  onTransfer={(posteId) => api.transfer(chatId, posteId)}
/>
```

---

## 🟠 CRM HAUTE

---

### CH-1 · Rappels et tâches de suivi

**Problème** : Il n'existe aucun système de tâches ou rappels. Le champ `Contact.next_call_date` existe mais n'est connecté à aucune logique de rappel.

**Impact** : Les agents oublient de rappeler les clients, les leads "tièdes" se perdent faute de suivi.

**Effort estimé** : Élevé (3–4 jours)

---

#### Backend

**1. Créer l'entité `Task`**

```typescript
// message_whatsapp/src/task/entities/task.entity.ts
@Entity('task')
export class Task {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ type: 'enum', enum: ['todo', 'done', 'cancelled'], default: 'todo' }) status: string;
  @Column({ type: 'enum', enum: ['low', 'medium', 'high'], default: 'medium' }) priority: string;
  @Column({ type: 'datetime', nullable: true }) due_at?: Date;
  @Column({ nullable: true }) contact_id?: string;
  @Column({ nullable: true }) chat_id?: string;
  @Column() assigned_to_commercial_id: string;
  @Column() created_by_commercial_id: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

**2. CRUD complet `TaskService` + `TaskController`**

- `GET /tasks?commercial_id=&status=&due_before=` — Lister les tâches
- `POST /tasks` — Créer une tâche
- `PATCH /tasks/:id` — Mettre à jour (statut, date, etc.)
- `DELETE /tasks/:id` — Supprimer

**3. Cron de rappel** (extension du `CronConfigService` existant)

```typescript
// Ajouter une entrée dans CRON_DEFAULTS :
'task-reminder': {
  label: 'Rappels de tâches',
  description: 'Notifie les agents des tâches dues dans l\'heure.',
  enabled: true,
  scheduleType: 'interval',
  intervalMinutes: 15,
}

// Handler :
async checkDueTasks(): Promise<void> {
  const soon = new Date(Date.now() + 60 * 60 * 1000); // 1h
  const dueTasks = await this.taskRepository.find({
    where: { status: 'todo', due_at: LessThan(soon) },
  });
  for (const task of dueTasks) {
    await this.gateway.emitTaskReminder(task);
  }
}
```

#### Frontend Commercial

**4. Widget "Mes tâches" dans la sidebar**

```
📋 Mes tâches (3)
├── 🔴 Rappeler Ahmed — dû à 14h00
├── 🟡 Envoyer devis Mohamed — dû demain
└── ⚪ Suivre commande Fatima — dû dans 3j
[+ Ajouter une tâche]
```

**5. Créer une tâche depuis une conversation**

- Bouton "Créer un rappel" dans le panneau de la conversation
- Pré-remplissage du nom du contact et du `chat_id`

---

### CH-2 · Réponses rapides (canned responses)

**Problème** : Le module `canned-responses` existait mais a été retiré (traces dans `dist/` uniquement). Les agents réécrivent les mêmes réponses des dizaines de fois par jour.

**Impact** : Perte de temps considérable, incohérence dans les formulations, qualité variable.

**Effort estimé** : Moyen (2 jours)

---

#### Backend

**1. Entité `CannedResponse`**

```typescript
@Entity('canned_response')
export class CannedResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() shortcut: string;        // ex: "/bonjour"
  @Column() title: string;           // ex: "Message de bienvenue"
  @Column({ type: 'text' }) body: string;  // Texte complet
  @Column({ nullable: true }) category?: string;  // ex: "Accueil", "Suivi"
  @Column({ default: true }) is_active: boolean;
  @CreateDateColumn() createdAt: Date;
}
```

**2. CRUD `CannedResponseController`**

- `GET /canned-responses` — Lister (filtrable par `category`, `search`)
- `POST /canned-responses` — Créer (AdminGuard)
- `PATCH /canned-responses/:id` — Modifier (AdminGuard)
- `DELETE /canned-responses/:id` — Supprimer (AdminGuard)

#### Frontend Commercial

**3. Déclenchement par raccourci `/` dans la zone de saisie**

```tsx
// Dans ChatInput.tsx, détecter la frappe de "/"
// Afficher un popover avec les réponses filtrées par le texte tapé
// Sélection → remplace le texte dans l'input
```

```
Zone de saisie : /bienven
┌─────────────────────────────────────────┐
│ 📝 Message de bienvenue                │
│    "Bonjour ! Bienvenue chez [Nom],    │
│     comment puis-je vous aider ?"      │
├─────────────────────────────────────────┤
│ 📝 Bienvenue retour                    │
│    "Ravi de vous revoir ! Comment..."  │
└─────────────────────────────────────────┘
```

#### Admin

**4. Page de gestion des réponses rapides**

- Tableau CRUD avec colonnes : Raccourci, Titre, Catégorie, Actif
- Éditeur de texte (avec support des variables comme `{{contact_name}}`)

---

### CH-3 · Labels / tags — terminer l'implémentation

**Problème** : L'entité `WhatsappChatLabel`, la gateway WebSocket et le module existent, mais `WhatsappChatLabelService` n'est qu'un placeholder — aucune méthode réelle.

**Impact** : Impossible de catégoriser les conversations, impossible de filtrer par label.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Implémenter `WhatsappChatLabelService`**

```typescript
// Remplacer les méthodes placeholder par de vraies implémentations :

async create(dto: CreateLabelDto): Promise<WhatsappChatLabel> {
  const label = this.repo.create(dto);
  return this.repo.save(label);
}

async findByChatId(chatId: string): Promise<WhatsappChatLabel[]> {
  return this.repo.find({ where: { chat_id: chatId } });
}

async findAll(): Promise<WhatsappChatLabel[]> {
  return this.repo.find({ order: { name: 'ASC' } });
}

async remove(id: string): Promise<void> {
  await this.repo.delete(id);
}
```

**2. Endpoint pour filtrer les conversations par label**

```typescript
// Dans WhatsappChatController :
// GET /chats?label=urgent
if (label) {
  qb.innerJoin('chat.labels', 'lbl', 'lbl.name = :label', { label });
}
```

#### Frontend Commercial

**3. Afficher et gérer les labels dans la conversation**

- Pastilles colorées sous le nom du contact dans la sidebar
- Bouton "Ajouter un label" dans le panneau de la conversation
- Filtre par label dans la sidebar

#### Admin

**4. Page de gestion des labels**

- Créer/modifier/supprimer des labels avec choix de couleur
- Statistiques : nombre de conversations par label

---

### CH-4 · Notifications pour les agents commerciaux

**Problème** : Le système de notifications (`AdminNotification`) n'existe que pour l'admin. Les agents ne reçoivent aucune notification système (hors WebSocket brut).

**Impact** : Un agent qui a plusieurs conversations ouvertes ne sait pas quelle conversation a reçu un nouveau message hors de sa vue active.

**Effort estimé** : Moyen (1–2 jours)

---

#### Backend

**1. Créer une table `AgentNotification`** (ou étendre `AdminNotification`)

```typescript
@Entity('agent_notification')
export class AgentNotification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() commercial_id: string;
  @Column({ type: 'enum', enum: ['new_message', 'transfer', 'task_due', 'sla_warning'] }) type: string;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) body?: string;
  @Column({ nullable: true }) chat_id?: string;
  @Column({ default: false }) read: boolean;
  @CreateDateColumn() createdAt: Date;
}
```

**2. Émettre des notifications à chaque événement clé**

Dans `WhatsappMessageGateway` ou `InboundMessageService` :

```typescript
// Nouveau message entrant → notifier l'agent du poste
await this.agentNotifService.create({
  commercial_id: poste.commercial_id,
  type: 'new_message',
  title: `Nouveau message de ${chat.name}`,
  chat_id: chat.chat_id,
});
```

**3. Endpoint SSE ou WebSocket pour les agents**

```typescript
// GET /agent-notifications/stream (SSE)
// GET /agent-notifications?read=false
// PATCH /agent-notifications/:id/read
// PATCH /agent-notifications/read-all
```

#### Frontend Commercial

**4. Badge de notifications dans le header**

```tsx
<NotificationBell unreadCount={unreadCount}>
  {notifications.map(n => (
    <NotificationItem
      key={n.id}
      title={n.title}
      onClick={() => { markRead(n.id); openChat(n.chat_id); }}
    />
  ))}
</NotificationBell>
```

---

### CH-5 · Audit trail des modifications

**Problème** : Aucune trace de "qui a modifié quoi et quand" sur les contacts et les conversations. Impossible de savoir quel agent a changé le statut d'un contact ou fermé une conversation.

**Impact** : Impossibilité de résoudre les litiges ou d'analyser les comportements des agents.

**Effort estimé** : Moyen (2 jours)

---

#### Backend

**1. Entité `AuditLog` générique**

```typescript
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() entity_type: string;   // 'contact' | 'chat' | 'template' | ...
  @Column() entity_id: string;
  @Column() action: string;        // 'status_changed' | 'note_updated' | 'transferred' | ...
  @Column({ type: 'json', nullable: true }) previous_value?: Record<string, unknown>;
  @Column({ type: 'json', nullable: true }) new_value?: Record<string, unknown>;
  @Column({ nullable: true }) performed_by_id?: string;
  @Column({ nullable: true }) performed_by_name?: string;
  @CreateDateColumn() createdAt: Date;
}
```

**2. Intercepteur ou décorateur TypeORM `@AfterUpdate`**

Plutôt qu'un intercepteur global, ajouter l'audit dans les méthodes de service existantes pour les actions clés :

- Changement de statut d'un contact (`conversion_status`)
- Fermeture/réouverture d'une conversation
- Transfert de conversation
- Mise à jour d'une note

**3. Endpoint de consultation**

```typescript
// GET /audit-log?entity_type=contact&entity_id=XXX
// GET /audit-log?entity_type=chat&entity_id=XXX
```

#### Admin

**4. Onglet "Historique" dans le détail d'un contact et d'une conversation**

```
Historique des modifications
├── 📝 2026-04-03 14:32 — Statut changé de "prospect" à "client" par Karim
├── 📞 2026-04-02 10:15 — Note d'appel mise à jour par Sofia
└── 🔄 2026-04-01 09:00 — Conversation fermée par Ahmed
```

---

## 🟡 CRM MOYENNE

---

### CM-1 · Pipeline de vente visuel (Kanban)

**Problème** : Les 4 statuts de conversion (`nouveau`, `prospect`, `client`, `perdu`) existent mais n'ont aucune représentation visuelle. Un manager ne peut pas voir d'un coup d'œil où en est chaque lead.

**Impact** : Suivi des ventes laborieux — nécessite d'exporter et d'analyser manuellement.

**Effort estimé** : Élevé (3–4 jours front)

---

#### Admin

**1. Vue Kanban dans `ClientsView.tsx`**

Basculer entre vue tableau (existante) et vue Kanban :

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   NOUVEAU    │   PROSPECT   │    CLIENT    │    PERDU     │
│     (12)     │     (8)      │     (23)     │     (4)      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 👤 Ahmed     │ 👤 Mohamed   │ 👤 Fatima    │ 👤 Karim     │
│   +213 55…   │   +213 66…   │   +213 77…   │   +213 88…   │
│   🔴 Haute   │   🟡 Moyenne │   ✅ Client  │   ❌ Perdu   │
│              │              │              │              │
│ 👤 Sara      │ 👤 Yasmine   │ …            │ …            │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**2. Glisser-déposer entre colonnes**

- Déplacer une carte → appel `PATCH /contact/:id` avec le nouveau `conversion_status`
- Mise à jour optimiste côté frontend

**3. Statistiques par colonne**

- Nombre de contacts par statut
- Valeur estimée si le champ est ajouté (voir CM-2)

---

### CM-2 · Scoring automatique des leads

**Problème** : Aucun score ne permet de prioriser les leads. Un agent traite tous les contacts au même niveau.

**Impact** : Les leads chauds ne sont pas identifiés rapidement.

**Effort estimé** : Moyen (2 jours)

---

#### Backend

**1. Ajouter un champ `lead_score` dans `Contact`**

```sql
ALTER TABLE contact ADD COLUMN lead_score TINYINT UNSIGNED DEFAULT 0;
```

**2. Calculer le score via un cron ou à la mise à jour**

Critères suggérés :

| Critère | Points |
|---------|--------|
| Message reçu dans les dernières 24h | +20 |
| Plus de 5 messages échangés | +15 |
| Statut `prospect` ou `client` | +20 |
| Priorité `haute` | +15 |
| Appel répondu (CallLog outcome = 'répondu') | +10 |
| Fenêtre 24h active | +20 |

**3. Cron de recalcul** (extension de `CronConfigService`)

```typescript
// Recalculer tous les scores chaque nuit
async recomputeLeadScores(): Promise<void> {
  const contacts = await this.contactRepository.find();
  for (const contact of contacts) {
    const score = await this.computeScore(contact);
    await this.contactRepository.update(contact.id, { lead_score: score });
  }
}
```

#### Frontend + Admin

**4. Afficher le score dans le tableau des contacts**

- Barre de progression colorée (0-100)
- Tri par score décroissant par défaut
- Filtre "Leads chauds" (score > 60)

---

### CM-3 · Satisfaction client (CSAT)

**Problème** : Aucun moyen de mesurer si le client a été satisfait de l'échange avec l'agent.

**Impact** : Impossible de détecter les agents sous-performants ou les types de problèmes mal gérés.

**Effort estimé** : Moyen (2–3 jours)

---

#### Backend

**1. Entité `CsatResponse`**

```typescript
@Entity('csat_response')
export class CsatResponse {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() chat_id: string;
  @Column() contact_id: string;
  @Column({ nullable: true }) commercial_id?: string;
  @Column({ type: 'tinyint' }) score: number;  // 1 à 5
  @Column({ type: 'text', nullable: true }) comment?: string;
  @CreateDateColumn() createdAt: Date;
}
```

**2. Envoi automatique du message CSAT à la fermeture de la conversation**

Dans le handler de fermeture (`status = 'fermé'`) :

```typescript
// Envoyer un message template WhatsApp de satisfaction
// (nécessite un template HSM CSAT approuvé par Meta)
await this.outboundRouter.sendTemplate(chat, 'satisfaction_client', []);
```

**3. Recevoir la réponse** (via `interactive` `button_reply` ou `list_reply`)

```typescript
// Dans InboundMessageService, détecter la réponse CSAT
// payload = "CSAT_3" → score = 3
if (message.button?.payload?.startsWith('CSAT_')) {
  const score = parseInt(message.button.payload.split('_')[1]);
  await this.csatService.save({ chat_id, contact_id, score });
}
```

#### Admin

**4. Métriques CSAT dans le dashboard**

- Score moyen par agent
- Score moyen par canal
- Evolution du CSAT dans le temps (graphique)

---

### CM-4 · Dashboard personnel de l'agent

**Problème** : Les agents ne voient pas leurs propres métriques. Seul l'admin a accès au tableau de bord analytique.

**Impact** : Les agents ne peuvent pas s'auto-évaluer ou se fixer des objectifs.

**Effort estimé** : Moyen (2 jours)

---

#### Backend

**1. Endpoint métriques personnelles**

```typescript
// GET /agent/me/stats
// Retourne les métriques de l'agent authentifié :
{
  conversations_today: 12,
  messages_sent_today: 47,
  avg_response_time_seconds: 145,
  open_conversations: 8,
  closed_today: 4,
  tasks_due_today: 3,
  csat_score_avg: 4.2,
}
```

#### Frontend Commercial

**2. Widget de métriques dans le header ou sidebar**

```
📊 Aujourd'hui
├── 💬 12 conversations
├── ⏱️ Tps réponse moyen : 2min 25s
├── ✅ 4 résolues
└── ⭐ CSAT : 4.2/5
```

---

### CM-5 · Permissions granulaires et rôle Manager

**Problème** : Seuls deux rôles existent — Admin (tout) et Agent (poste uniquement). Il n'y a pas de rôle intermédiaire pour un manager de poste.

**Impact** : Impossible de déléguer la gestion d'un poste sans donner l'accès admin complet.

**Effort estimé** : Élevé (3–4 jours)

---

#### Backend

**1. Ajouter un champ `role` sur `WhatsappCommercial`**

```sql
ALTER TABLE whatsapp_commercial
  ADD COLUMN role ENUM('agent', 'manager', 'supervisor') DEFAULT 'agent';
```

**2. Créer un `ManagerGuard`**

```typescript
// Accès : admin OU commercial avec role = 'manager'/'supervisor'
@Injectable()
export class ManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    return req.user?.role === 'manager' || req.user?.isAdmin;
  }
}
```

**3. Permissions par rôle**

| Action | Agent | Manager | Admin |
|--------|-------|---------|-------|
| Voir ses conversations | ✅ | ✅ | ✅ |
| Voir toutes les conversations du poste | ❌ | ✅ | ✅ |
| Transférer une conversation | ✅ | ✅ | ✅ |
| Créer des réponses rapides | ❌ | ✅ | ✅ |
| Voir les métriques du poste | ❌ | ✅ | ✅ |
| Gérer les agents du poste | ❌ | ✅ | ✅ |
| Accès panel admin | ❌ | ❌ | ✅ |

#### Admin

**4. Gestion des rôles dans la page des commerciaux**

- Dropdown de sélection du rôle par commercial
- Interface de gestion du poste pour les managers (mini-admin)

---

## 🟢 CRM BASSE

---

### CB-1 · Tags sur les contacts

**Problème** : Les labels n'existent que sur les conversations. Il est impossible de tagger un contact directement (ex: "VIP", "Churn Risk", "Revendeur").

**Effort estimé** : Faible (1 jour) — **Prérequis** : CH-3

**Implementation** :
- Table `contact_tag` : `contact_id`, `name`, `color`
- Ajouter dans le formulaire de contact et le détail admin
- Permettre le filtrage des contacts par tag

---

### CB-2 · Export planifié et filtré

**Problème** : L'export est manuel et non filtrable par poste. Il n'est pas possible de programmer un rapport automatique.

**Effort estimé** : Moyen (2 jours)

**Implementation** :
- Paramètre `poste_id` / `commercial_id` dans les exports existants
- Endpoint backend pour générer et retourner le fichier
- Option "Recevoir par email chaque [Lundi/1er du mois]" (cron + nodemailer)

---

### CB-3 · 2FA pour admin et agents

**Problème** : L'authentification est par mot de passe seul — pas de second facteur.

**Effort estimé** : Moyen (2 jours)

**Implementation** :
- TOTP (Google Authenticator) via `otplib`
- QR code affiché une fois lors de l'activation
- Vérification du code 6 chiffres au login

---

### CB-4 · Historique multi-canal unifié

**Problème** : L'historique d'un contact mélange WhatsApp, Instagram, Messenger dans des tables séparées sans vue unifiée.

**Effort estimé** : Faible (1 jour) — les données existent déjà

**Implementation** :
- Vue `ContactTimeline` qui agrège : messages WhatsApp + Instagram + Messenger + appels, triés par `timestamp`
- Icône de canal devant chaque entrée (WhatsApp, Instagram, téléphone)

---

## Ordre d'implémentation global recommandé (Parties I + II)

```
Sprint 1 — Quick wins critiques (~ 1 semaine)
├── C-2  · Codes d'erreur Meta lisibles      (0,5j — frontend seul)
├── CR-4 · Archivage endpoint + UI           (0,5j — très rapide)
├── CR-3 · Champs contact manquants          (1j)
└── CR-2 · Notes sur les conversations       (1j)

Sprint 2 — Fonctionnalités bloquantes (~ 1,5 semaine)
├── C-1  · account_update désactivation      (2-3j)
├── H-1  · Brancher message_template_status  (1-2j)
└── CR-1 · Recherche contacts + conversations (2-3j)

Sprint 3 — CRM haute valeur (~ 2 semaines)
├── CR-5 · Transfert manuel entre agents     (1-2j)
├── CH-2 · Réponses rapides (canned)         (2j)
├── CH-3 · Labels — terminer l'implémentation (1-2j)
└── CH-4 · Notifications agents              (1-2j)

Sprint 4 — Webhooks Meta + Rappels (~ 2 semaines)
├── H-4  · referral (origine pub)            (1-2j)
├── H-2  · phone_number_quality_update       (1j)
├── H-3  · account_alerts                    (0,5j)
└── CH-1 · Rappels / tâches de suivi         (3-4j)

Sprint 5 — CRM intermédiaire (~ 2 semaines)
├── CH-5 · Audit trail                       (2j)
├── CM-4 · Dashboard agent                   (2j)
├── CM-3 · CSAT satisfaction client          (2-3j)
└── M-1  · Réactions emoji                   (1-2j)

Sprint 6 — CRM avancé (~ 2 semaines)
├── CM-1 · Pipeline Kanban                   (3-4j)
├── CM-2 · Scoring automatique leads         (2j)
└── CM-5 · Permissions + rôle Manager        (3-4j)

Sprint 7 — Basse priorité selon besoins
├── CB-1 · Tags sur contacts
├── CB-2 · Export planifié
├── CB-3 · 2FA
├── CB-4 · Historique multi-canal unifié
├── M-2  · Appels manqués (calls)
├── M-3  · RGPD user_preferences
└── M-6  · WhatsApp Flows
```

---

*Partie II — Sources : `contact.entity.ts`, `whatsapp_chat.entity.ts`, `whatsapp_message.entity.ts`, `call_log.entity.ts`, `whatsapp_chat_label.entity.ts`, `notification.entity.ts`, `metriques.service.ts`, `ClientsView.tsx`, `ContactDetailView.tsx`, `AnalyticsView.tsx`.*
