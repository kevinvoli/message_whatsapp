# Plan d'Implémentation — Fonctionnalités Manquantes

> **Objectif** : Implémenter toutes les fonctionnalités absentes identifiées dans
> `ANALYSE_APPLICATION.md` et `META_WEBHOOK_EVENTS_PAR_PRIORITE_ET_INTERFACE.md`
> pour atteindre le niveau des standards du domaine CCaaS.
>
> **Date** : 2026-03-25
> **Références** : `ANALYSE_APPLICATION.md` § 4, `META_WEBHOOK_EVENTS_PAR_PRIORITE_ET_INTERFACE.md`

---

## Sommaire

### 🔴 Critique — Avant toute mise en production
1. [Monitoring santé compte Meta](#1-monitoring-santé-compte-meta)
2. [Erreurs de livraison lisibles pour l'agent](#2-erreurs-de-livraison-lisibles-pour-lagent)

### 🟠 Haute priorité — Sprint 1
3. [Réponses prédéfinies (Canned Responses)](#3-réponses-prédéfinies-canned-responses)
4. [Notes internes par conversation](#4-notes-internes-par-conversation)
5. [Transfert de conversation entre agents](#5-transfert-de-conversation-entre-agents)
6. [Origine publicitaire des conversations (Referral)](#6-origine-publicitaire-des-conversations-referral)

### 🟡 Priorité moyenne — Sprint 2
7. [Indicateurs de lecture visuels (✓ ✓✓ bleu)](#7-indicateurs-de-lecture-visuels)
8. [Tags et Labels sur les conversations](#8-tags-et-labels-sur-les-conversations)
9. [Alertes SLA — Conversations sans réponse](#9-alertes-sla--conversations-sans-réponse)
10. [Appels manqués — Notifications et rappels](#10-appels-manqués--notifications-et-rappels)
11. [Réactions emoji sur les messages](#11-réactions-emoji-sur-les-messages)
12. [Opt-in / Opt-out client (RGPD)](#12-opt-in--opt-out-client-rgpd)

### 🟢 Basse priorité — Sprint 3+
13. [Satisfaction client (CSAT)](#13-satisfaction-client-csat)
14. [Types de messages non gérés (sticker, contacts, system)](#14-types-de-messages-non-gérés)
15. [WhatsApp Flows — Formulaires natifs](#15-whatsapp-flows--formulaires-natifs)
16. [Qualité et statut des templates HSM](#16-qualité-et-statut-des-templates-hsm)

---

## 🔴 CRITIQUE

---

### 1. Monitoring santé compte Meta

**Problème** : Si Meta désactive le compte WhatsApp Business ou le Business Manager,
l'application continue d'essayer d'envoyer des messages — personne n'est averti.

**Champs webhook concernés** : `account_update`, `business_status_update`, `account_alerts`, `phone_number_quality_update`

#### Backend

**Étape 1 — Migration base de données**
```sql
-- Ajouter à la table whapi_channels
ALTER TABLE whapi_channels
  ADD COLUMN meta_account_status    VARCHAR(32)  DEFAULT 'ACTIVE',
  ADD COLUMN meta_account_status_at DATETIME     NULL,
  ADD COLUMN meta_tier              VARCHAR(32)  NULL,
  ADD COLUMN meta_tier_updated_at   DATETIME     NULL;

-- Nouvelle table pour les alertes Meta
CREATE TABLE meta_account_alerts (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  channel_id  VARCHAR(191) NOT NULL,
  field       VARCHAR(64)  NOT NULL,
  event_type  VARCHAR(64)  NOT NULL,
  severity    VARCHAR(16)  NULL,
  payload     JSON         NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at DATETIME NULL
);
```

**Étape 2 — Étendre le contrôleur webhook**

Dans `whapi.controller.ts`, le handler `POST /webhooks/meta/:channelId` traite actuellement
uniquement `field === 'messages'`. Il faut ajouter le routing vers les nouveaux champs :

```typescript
// Dans handleMetaWebhook() — dispatcher selon le champ
const field = payload?.entry?.[0]?.changes?.[0]?.field;

switch (field) {
  case 'messages':
    await this.whapiService.handleMetaWebhook(payload, tenantId);
    break;
  case 'account_update':
    await this.metaAccountHealthService.handleAccountUpdate(payload, channelId);
    break;
  case 'business_status_update':
    await this.metaAccountHealthService.handleBusinessStatusUpdate(payload, channelId);
    break;
  case 'account_alerts':
    await this.metaAccountHealthService.handleAccountAlert(payload, channelId);
    break;
  case 'phone_number_quality_update':
    await this.metaAccountHealthService.handlePhoneQualityUpdate(payload, channelId);
    break;
}
```

**Étape 3 — Créer `MetaAccountHealthService`**

Nouveau service dans `message_whatsapp/src/channel/meta-account-health.service.ts` :
- `handleAccountUpdate()` : met à jour `meta_account_status`, envoie une notification si `DISABLED`/`BANNED`
- `handleBusinessStatusUpdate()` : même logique au niveau Business Manager
- `handleAccountAlert()` : persiste l'alerte dans `meta_account_alerts`
- `handlePhoneQualityUpdate()` : met à jour `meta_tier`

**Étape 4 — Bloquer les envois si compte désactivé**

Dans `OutboundRouterService.sendTextMessage()`, avant d'appeler `metaService.sendTextMessage()` :
```typescript
if (channel.meta_account_status === 'DISABLED' || channel.meta_account_status === 'BANNED') {
  throw new WhapiOutboundError(
    'Canal Meta désactivé — envoi impossible',
    'permanent',
    403,
  );
}
```

#### Admin

**Vue "Santé des canaux"** dans `ChannelsView.tsx` :
- Badge coloré par canal : 🟢 ACTIVE / 🟠 RESTRICTED / 🔴 DISABLED
- Tier actuel affiché : TIER_1K / TIER_10K / TIER_100K
- Centre de notifications : liste des alertes non acquittées avec bouton "Marquer comme traitée"
- Bannière globale en haut de toutes les pages si au moins un canal est `DISABLED`

**Souscrire dans Meta for Developers** :
`account_update`, `business_status_update`, `account_alerts`, `phone_number_quality_update`

---

### 2. Erreurs de livraison lisibles pour l'agent

**Problème** : `error_code` et `error_title` sont stockés dans `WhatsappMessage`
mais le frontend affiche uniquement "Échec" sans détail.

#### Backend

Aucune modification nécessaire — les données sont déjà en base.

Ajouter la valeur `error_code` et `error_title` dans la réponse API des messages :
vérifier que les DTOs de réponse exposent ces deux champs (les inclure si absent).

#### Frontend (`front/`)

Dans `front/src/components/chat/ChatMessage.tsx`, créer une fonction de mapping :

```typescript
const META_ERROR_LABELS: Record<number, { label: string; action?: string }> = {
  131026: { label: "Numéro non joignable sur WhatsApp" },
  131047: { label: "Fenêtre 24h expirée", action: "Utilisez un template pour recontacter" },
  131048: { label: "Message signalé comme spam par le destinataire" },
  131051: { label: "Type de message non supporté" },
  131052: { label: "Fichier média expiré — renvoyez le fichier" },
  130429: { label: "Limite de débit atteinte", action: "Réessayez dans quelques minutes" },
  131000: { label: "Erreur Meta interne", action: "Réessayez" },
  100:    { label: "Configuration du canal incorrecte", action: "Vérifiez le Phone Number ID" },
};
```

Affichage sous le message échoué :
```
❌ Message non délivré
   Fenêtre 24h expirée
   → Utilisez un template pour recontacter ce client.
```

---

## 🟠 HAUTE PRIORITÉ

---

### 3. Réponses prédéfinies (Canned Responses)

**Problème** : Les agents tapent tout manuellement — pas de bibliothèque de réponses types.

#### Base de données

```sql
CREATE TABLE canned_responses (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  tenant_id   CHAR(36)     NOT NULL,
  shortcut    VARCHAR(64)  NOT NULL,   -- ex: "/bonjour", "/horaires"
  title       VARCHAR(128) NOT NULL,
  content     TEXT         NOT NULL,
  category    VARCHAR(64)  NULL,
  created_by  CHAR(36)     NULL,       -- commercial_id ou admin_id
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_canned_tenant_shortcut (tenant_id, shortcut)
);
```

#### Backend

Nouveau module `canned-responses` :
- `GET /canned-responses` — liste (filtrable par catégorie, recherche texte)
- `POST /canned-responses` — création (admin uniquement)
- `PUT /canned-responses/:id` — modification
- `DELETE /canned-responses/:id` — suppression

#### Frontend Commercial

Dans `ChatInput.tsx` :
1. Détecter quand l'agent tape `/` en début de message
2. Ouvrir un popover avec la liste des réponses correspondant au texte tapé
3. Sélection par clic ou touche `↑↓ Enter`
4. Remplacer le contenu du textarea par la réponse sélectionnée
5. Permettre des variables dynamiques : `{{nom_client}}`, `{{agent_name}}`

#### Admin

Dans `admin/`, ajouter une vue "Réponses prédéfinies" :
- CRUD complet avec éditeur de texte riche
- Gestion des catégories (ex: "Accueil", "SAV", "Clôture")
- Import/export CSV

---

### 4. Notes internes par conversation

**Problème** : Aucun moyen pour un agent de laisser un commentaire interne.

#### Base de données

```sql
CREATE TABLE conversation_notes (
  id              CHAR(36)  PRIMARY KEY DEFAULT (UUID()),
  chat_id         VARCHAR(100) NOT NULL,
  tenant_id       CHAR(36)  NOT NULL,
  author_id       CHAR(36)  NOT NULL,   -- commercial_id ou admin_id
  author_type     ENUM('commercial', 'admin') NOT NULL,
  content         TEXT      NOT NULL,
  created_at      DATETIME  DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME  NULL,
  INDEX IDX_notes_chat (tenant_id, chat_id)
);
```

#### Backend

Endpoints dans le module `whatsapp_message` ou nouveau module `conversation-notes` :
- `GET /conversations/:chatId/notes` — liste les notes de la conversation
- `POST /conversations/:chatId/notes` — ajoute une note
- `DELETE /conversations/:chatId/notes/:noteId` — supprime sa propre note

Les notes doivent être retournées avec les conversations via WebSocket (enrichir le payload de `notifyNewMessage`).

#### Frontend Commercial

Dans la vue de conversation (zone des messages) :
- Bouton "📝 Note interne" dans la barre d'outils de `ChatInput`
- Les notes s'affichent dans l'historique avec un fond jaune pâle et la mention "Note interne — [Nom agent]"
- Elles ne sont jamais visibles côté client (filtrage strict)
- Icône de crayon pour modifier/supprimer sa propre note

---

### 5. Transfert de conversation entre agents

**Problème** : Aucun mécanisme pour passer une conversation à un collègue.

#### Base de données

```sql
-- Ajouter un audit des transferts
CREATE TABLE conversation_transfers (
  id               CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  chat_id          VARCHAR(100) NOT NULL,
  tenant_id        CHAR(36)     NOT NULL,
  from_poste_id    CHAR(36)     NULL,
  to_poste_id      CHAR(36)     NOT NULL,
  transferred_by   CHAR(36)     NOT NULL,  -- commercial_id initiateur
  reason           TEXT         NULL,
  transferred_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX IDX_transfer_chat (tenant_id, chat_id)
);
```

#### Backend

Nouvel endpoint dans `DispatcherModule` :
- `POST /conversations/:chatId/transfer` — corps : `{ to_poste_id, reason? }`
  1. Vérifier que le `to_poste_id` existe et que l'agent est en ligne
  2. Mettre à jour `whatsapp_chat.poste_id`
  3. Logger dans `conversation_transfers`
  4. Émettre un événement WebSocket à l'ancien agent (conversation retirée) et au nouveau (conversation ajoutée)
  5. Émettre une note interne automatique : "Conversation transférée de [Agent A] à [Agent B] — Raison : [...]"

#### Frontend Commercial

Dans `ChatHeader.tsx` ou `conversationOptionMenu.tsx` :
- Bouton "↗ Transférer" visible uniquement si l'agent est l'assigné courant
- Modal : liste des agents disponibles (en ligne en ce moment) avec barre de recherche
- Champ optionnel "Raison du transfert"
- Confirmation et feedback visuel

---

### 6. Origine publicitaire des conversations (Referral)

**Problème** : Le champ `referral` Meta est perdu — données pub non exploitées.

#### Base de données

```sql
ALTER TABLE whatsapp_chat
  ADD COLUMN referral_source_type VARCHAR(32)  NULL,
  ADD COLUMN referral_source_id   VARCHAR(128) NULL,
  ADD COLUMN referral_headline    VARCHAR(255) NULL,
  ADD COLUMN referral_source_url  TEXT         NULL;
```

#### Backend

Dans `MetaMessageBase` (interface) :
```typescript
referral?: {
  source_url: string;
  source_type: 'ad' | 'post' | 'unknown';
  source_id: string;
  headline?: string;
  body?: string;
};
```

Dans `MetaAdapter.mapMessage()`, extraire `referral` et le passer dans `UnifiedMessage`.
Dans `InboundMessageService`, si `message.referral` présent et conversation nouvelle,
persister les données sur `WhatsappChat`.

#### Frontend Commercial

Dans `ClientInfoBanner.tsx` ou une nouvelle bannière en haut de la conversation :
```
📢 Client venu via une publicité Meta
   "Offre spéciale Ramadan — Contactez-nous"
```
Visible uniquement au premier message, collapse automatique après.

#### Admin

Dans `AnalyticsView.tsx`, ajouter une section "Sources de conversations" :
- Graphique camembert : Organique / Pub A / Pub B / ...
- Tableau par campagne : nb conversations, nb converties, taux

---

## 🟡 PRIORITÉ MOYENNE

---

### 7. Indicateurs de lecture visuels

**Problème** : Les statuts sont en base mais non affichés visuellement.

#### Frontend uniquement

Dans `ChatMessage.tsx`, pour les messages `from_me === true` :

```typescript
function DeliveryIcon({ status }: { status: string }) {
  if (status === 'sent')      return <Check className="w-3 h-3 text-gray-400" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === 'read')      return <CheckCheck className="w-3 h-3 text-blue-500" />;
  if (status === 'failed')    return <X className="w-3 h-3 text-red-500" />;
  return null;
}
```

Afficher l'icône en bas à droite de la bulle du message sortant (comme WhatsApp natif).

**Mise à jour en temps réel** : déjà possible via WebSocket (les statuts sont pushés) —
vérifier que le store `chatStore` met bien à jour le statut du message existant lors de la réception d'un statut.

---

### 8. Tags et Labels sur les conversations

**Problème** : Les filtres sont statiques — aucune catégorisation dynamique.

#### Base de données

```sql
CREATE TABLE conversation_tags (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  tenant_id  CHAR(36)     NOT NULL,
  name       VARCHAR(64)  NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#6B7280',
  UNIQUE KEY UQ_tag_tenant_name (tenant_id, name)
);

CREATE TABLE chat_tags (
  chat_id    VARCHAR(100) NOT NULL,
  tag_id     CHAR(36)     NOT NULL,
  added_by   CHAR(36)     NULL,
  added_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, tag_id)
);
```

#### Backend

- `GET /tags` — liste des tags du tenant
- `POST /tags` — créer un tag (admin)
- `POST /conversations/:chatId/tags` — ajouter un tag
- `DELETE /conversations/:chatId/tags/:tagId` — retirer un tag

#### Frontend Commercial

- Pills de couleur sur chaque conversation dans `ConversationItem.tsx`
- Dans `ChatHeader.tsx` : bouton "🏷️ Tags" → dropdown multi-sélection
- Filtre "Par tag" dans `ConversationFilters.tsx`

#### Admin

- Vue "Gestion des tags" : CRUD + statistiques (nb conversations par tag)

---

### 9. Alertes SLA — Conversations sans réponse

**Problème** : `first_response_deadline_at` existe en base mais n'est pas surveillé.

#### Backend

CronJob dans `JorbsModule` (toutes les minutes) :
```typescript
@Cron('* * * * *')
async checkSlaBreaches() {
  const overdue = await this.chatRepository.find({
    where: {
      status: WhatsappChatStatus.ACTIF,
      first_response_deadline_at: LessThan(new Date()),
      // Pas encore répondu = dernier message est entrant
    }
  });

  for (const chat of overdue) {
    await this.notificationService.notifySlaBreach(chat);
  }
}
```

Notification WebSocket poussée à l'agent assigné :
```json
{
  "type": "sla_breach",
  "chatId": "...",
  "clientName": "Ahmed",
  "waitingSince": "14:32"
}
```

#### Frontend Commercial

- Badge rouge clignotant sur la conversation dans `ConversationItem.tsx` si SLA dépassé
- Toast de notification push : "⏰ Ahmed attend depuis 8 min sans réponse"
- Filtre "SLA dépassé" dans `ConversationFilters.tsx`

#### Admin

- Compteur "SLA dépassés" dans `OverviewView.tsx`
- Paramétrage du seuil SLA (en minutes) dans `DispatchView.tsx`

---

### 10. Appels manqués — Notifications et rappels

**Problème** : Le webhook `calls` n'est pas souscrit — les appels manqués sont invisibles.

#### Backend

Souscrire au champ `calls` dans Meta for Developers.

Nouvel handler dans le webhook controller :
```typescript
case 'calls':
  await this.callsService.handleCallEvent(payload, channelId);
  break;
```

`CallsService.handleCallEvent()` :
- Si `call_status === 'missed'` : créer une tâche de rappel dans une nouvelle table `callback_tasks`
- Émettre un événement WebSocket `call_missed` vers l'agent assigné à ce `chat_id`

#### Frontend Commercial

Dans la conversation :
```
📞 Appel manqué — aujourd'hui à 14h32
   [✅ Rappelé] [📅 Planifier un rappel]
```

Notification push à l'agent si conversation ouverte.

---

### 11. Réactions emoji sur les messages

**Problème** : `type: "reaction"` non géré — les réactions des clients sont perdues.

#### Base de données

```sql
CREATE TABLE message_reactions (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  message_id  CHAR(36)     NOT NULL,
  from_phone  VARCHAR(32)  NOT NULL,
  emoji       VARCHAR(16)  NOT NULL,
  reacted_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_reaction_msg_from (message_id, from_phone),
  FOREIGN KEY (message_id) REFERENCES whatsapp_message(id) ON DELETE CASCADE
);
```

#### Backend

Dans `MetaMessageType`, ajouter `'reaction'`.
Dans `MetaAdapter`, mapper le type `reaction` et extraire `reaction.message_id` + `reaction.emoji`.
Dans `InboundMessageService`, si `type === 'reaction'` :
- Si `emoji === ''` → supprimer la réaction existante
- Sinon → upsert dans `message_reactions`
- Pousser une mise à jour WebSocket vers l'agent

#### Frontend Commercial

Sous chaque message dans `ChatMessage.tsx` :
```
"Votre commande est confirmée."
                              👍 1
```

---

### 12. Opt-in / Opt-out client (RGPD)

**Problème** : `user_preferences` non souscrit — les opt-out marketing sont ignorés.

#### Base de données

```sql
ALTER TABLE contact
  ADD COLUMN marketing_opt_in  BOOLEAN  DEFAULT TRUE,
  ADD COLUMN messaging_opt_in  BOOLEAN  DEFAULT TRUE,
  ADD COLUMN opt_updated_at    DATETIME NULL;
```

#### Backend

Souscrire au champ `user_preferences`.
Handler : mettre à jour les colonnes opt-in sur le contact correspondant au `wa_id`.

Dans `OutboundRouterService`, avant envoi d'un template `MARKETING` :
```typescript
if (contact.marketing_opt_in === false) {
  this.logger.warn(`MARKETING_OPT_OUT chat=${chatId} — envoi bloqué`);
  throw new WhapiOutboundError('Contact opt-out marketing', 'permanent', 403);
}
```

#### Frontend Commercial

Dans la fiche contact :
```
📢 Communications marketing : 🚫 Refusées (depuis le 15/03/2026)
```

---

## 🟢 BASSE PRIORITÉ

---

### 13. Satisfaction client (CSAT)

**Mécanisme** : à la clôture d'une conversation, envoyer automatiquement un template HSM
avec 3 boutons Quick Reply : ⭐ Mauvais / ⭐⭐⭐ Correct / ⭐⭐⭐⭐⭐ Excellent.

#### Base de données

```sql
CREATE TABLE csat_responses (
  id              CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  chat_id         VARCHAR(100) NOT NULL,
  tenant_id       CHAR(36)     NOT NULL,
  commercial_id   CHAR(36)     NULL,
  score           TINYINT      NOT NULL,  -- 1, 3, ou 5
  responded_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
);
```

#### Backend

À la clôture d'une conversation (`status = FERME`), si CSAT activé dans les paramètres :
1. Attendre 5 minutes (CronJob ou setTimeout)
2. Envoyer le template CSAT via `OutboundRouterService`
3. Quand la réponse arrive (type `button` ou `interactive`), parser le payload et insérer dans `csat_responses`

#### Admin

- Score CSAT moyen par agent dans `PerformanceView.tsx`
- Évolution du CSAT dans le temps dans `AnalyticsView.tsx`
- Alertes si CSAT d'un agent descend sous un seuil

---

### 14. Types de messages non gérés

**Sticker** :
- Ajouter `'sticker'` dans `MetaMessageType`
- Dans `MetaAdapter.mapType()` : retourner `'sticker'`
- Dans `ChatMessage.tsx` : afficher l'image WebP depuis le media_id

**Contacts partagés** :
- Ajouter `'contacts'` dans `MetaMessageType`
- Afficher : "👤 Jean Dupont — +33 6 XX XX XX"

**Message système** (changement de numéro) :
- Ajouter `'system'` dans `MetaMessageType`
- Si `system.type === 'user_changed_number'` : afficher une notification dans la conversation
  et créer un lien entre l'ancien et le nouveau `chat_id`

**Unsupported** :
- Afficher un placeholder : "⚠️ Ce type de message n'est pas supporté dans cette interface"
  au lieu de vide / erreur

---

### 15. WhatsApp Flows — Formulaires natifs

**Concept** : Envoyer des formulaires interactifs natifs WhatsApp (prise de RDV, qualification, satisfaction).

#### Étapes

1. Créer les Flows dans Meta for Developers (interface graphique no-code)
2. Souscrire au champ webhook `flows` pour surveiller leur statut
3. Backend : nouveau endpoint `POST /messages/flow` pour envoyer un Flow
4. Traiter les réponses (`type: "interactive"`, `interactive.type: "nfm_reply"`)
5. Extraire les données structurées du formulaire et les afficher dans la conversation

---

### 16. Qualité et statut des templates HSM

**Étapes** :

1. Souscrire aux champs `message_template_status_update` et `message_template_quality_update`
2. Créer la table `message_templates`
3. Handler qui met à jour `status` et `quality_score` à chaque webhook
4. Bloquer l'envoi si `status !== 'APPROVED'` dans `AutoMessageOrchestratorService`
5. Vue admin "Templates" : liste avec statut coloré et score de qualité

---

## Tableau récapitulatif

| # | Fonctionnalité | Interfaces | Sprint | Effort |
|---|---------------|-----------|--------|--------|
| 1 | Monitoring santé Meta | ⚙️ + 🛡️ | 0 (avant prod) | 3j |
| 2 | Erreurs livraison lisibles | 💬 | 0 (avant prod) | 0.5j |
| 3 | Réponses prédéfinies | ⚙️ + 💬 + 🛡️ | 1 | 3j |
| 4 | Notes internes | ⚙️ + 💬 | 1 | 2j |
| 5 | Transfert de conversation | ⚙️ + 💬 | 1 | 3j |
| 6 | Referral publicitaire | ⚙️ + 💬 + 🛡️ | 1 | 2j |
| 7 | Indicateurs de lecture | 💬 | 2 | 0.5j |
| 8 | Tags / Labels | ⚙️ + 💬 + 🛡️ | 2 | 3j |
| 9 | Alertes SLA | ⚙️ + 💬 + 🛡️ | 2 | 2j |
| 10 | Appels manqués | ⚙️ + 💬 | 2 | 2j |
| 11 | Réactions emoji | ⚙️ + 💬 | 2 | 2j |
| 12 | Opt-in RGPD | ⚙️ + 💬 + 🛡️ | 2 | 2j |
| 13 | CSAT | ⚙️ + 🛡️ | 3+ | 4j |
| 14 | Types non gérés (sticker…) | ⚙️ + 💬 | 3+ | 1j |
| 15 | WhatsApp Flows | ⚙️ + 💬 + 🛡️ | 3+ | 5j |
| 16 | Qualité templates HSM | ⚙️ + 🛡️ | 3+ | 3j |

---

*Pour les améliorations des fonctionnalités existantes, voir `PLAN_PRODUCTION_READINESS.md`.*
*Pour l'audit architecture backend, voir `AUDIT_ARCHITECTURE_BACKEND.md`.*
