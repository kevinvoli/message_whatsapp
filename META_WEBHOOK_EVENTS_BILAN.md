# Bilan Complet — Événements Webhook Meta WhatsApp Business API

> **Contexte** : Ce document analyse l'ensemble des événements (webhook subscriptions) disponibles
> sur la plateforme Meta pour une application WhatsApp Business, leur fonctionnement technique,
> et leur pertinence dans l'amélioration de l'application actuelle.
>
> **Date de rédaction** : 2026-03-24 — **Mis à jour** : 2026-04-03 (audit complet du code)
> **Version API Meta** : v25.0 (liste officielle du tableau de bord)
> **Application** : Plateforme de messagerie multi-agents (NestJS + React) — providers : WhatsApp (Meta Cloud API), Instagram, Messenger, Telegram (Whapi)
> **Champ actuellement souscrit** : `messages` ✅ — `message_template_status_update` ⚠️ souscrit mais non traité

---

## Table des matières

1. [Architecture actuelle des webhooks](#1-architecture-actuelle-des-webhooks)
2. [Vue d'ensemble de tous les champs disponibles](#2-vue-densemble-de-tous-les-champs-disponibles)
3. [Champ `messages` — Messagerie principale](#3-champ-messages--messagerie-principale)
   - [3.1 Types de messages entrants](#31-types-de-messages-entrants)
   - [3.2 Statuts de livraison](#32-statuts-de-livraison)
4. [Champs de communication avancée](#4-champs-de-communication-avancée)
   - [`message_echoes` — Copie des messages sortants](#message_echoes)
   - [`smb_message_echoes` — Copie messages sortants (SMB)](#smb_message_echoes)
   - [`messaging_handovers` — Transfert de conversation entre agents/bots](#messaging_handovers)
   - [`calls` — Appels WhatsApp](#calls)
   - [`flows` — WhatsApp Flows](#flows)
   - [`automatic_events` — Événements automatiques](#automatic_events)
   - [`tracking_events` — Suivi d'événements marketing](#tracking_events)
5. [Champs de gestion de compte](#5-champs-de-gestion-de-compte)
   - [`account_update`](#account_update)
   - [`account_alerts`](#account_alerts)
   - [`account_review_update`](#account_review_update)
   - [`account_settings_update`](#account_settings_update)
   - [`business_capability_update`](#business_capability_update)
   - [`business_status_update`](#business_status_update)
   - [`partner_solutions`](#partner_solutions)
   - [`smb_app_state_sync`](#smb_app_state_sync)
   - [`payment_configuration_update`](#payment_configuration_update)
   - [`history`](#history)
6. [Champs liés aux templates (HSM)](#6-champs-liés-aux-templates-hsm)
   - [`message_template_status_update`](#message_template_status_update)
   - [`message_template_quality_update`](#message_template_quality_update)
   - [`message_template_components_update`](#message_template_components_update)
   - [`template_category_update`](#template_category_update)
   - [`template_correct_category_detection`](#template_correct_category_detection)
7. [Champs liés aux numéros de téléphone](#7-champs-liés-aux-numéros-de-téléphone)
   - [`phone_number_name_update`](#phone_number_name_update)
   - [`phone_number_quality_update`](#phone_number_quality_update)
8. [Champs liés aux groupes WhatsApp](#8-champs-liés-aux-groupes-whatsapp)
   - [`group_lifecycle_update`](#group_lifecycle_update)
   - [`group_participants_update`](#group_participants_update)
   - [`group_settings_update`](#group_settings_update)
   - [`group_status_update`](#group_status_update)
9. [Champs de préférences utilisateur et sécurité](#9-champs-de-préférences-utilisateur-et-sécurité)
   - [`user_preferences`](#user_preferences)
   - [`security`](#security)
10. [Tableau récapitulatif de pertinence](#10-tableau-récapitulatif-de-pertinence)
11. [État actuel du code et lacunes identifiées](#11-état-actuel-du-code-et-lacunes-identifiées)
12. [Recommandations priorisées](#12-recommandations-priorisées)

---

## 1. Architecture actuelle des webhooks

### Ce que le code gère aujourd'hui (Meta)

L'application reçoit les webhooks Meta via `POST /webhooks/meta/:channelId`.
Le payload est traité par `UnifiedIngressService.ingestMeta()` → `MetaAdapter` → `InboundMessageService`.

```
MetaWebhookPayload
└── entry[]
    └── changes[]
        └── value
            ├── metadata         → phone_number_id (identifiant du canal)
            ├── contacts[]       → infos sur l'expéditeur
            ├── messages[]       → messages entrants  ✅ géré
            └── statuses[]       → accusés de réception ✅ géré (sent/delivered/read/failed)
```

**Types de messages actuellement mappés dans `MetaAdapter`** (audit 2026-04-03) :
`text`, `image`, `audio`, `video`, `document`, `location`, `interactive` (button_reply + list_reply), `button`, `sticker` ✅

**Fournisseurs pris en charge** : WhatsApp (Meta Cloud API via `WebhookController` + `MetaAdapter`), Instagram (`InstagramAdapter`), Messenger (`MessengerAdapter`), Telegram/Whapi (`WhapiController`)

**Champ unique souscrit et entièrement géré** : `messages`
**Souscrit mais ignoré** : `message_template_status_update` ⚠️ (souscrit dans `meta-token.service.ts` L229 mais payload non traité dans le contrôleur)
**Tous les autres champs** : non souscrits → aucune notification reçue

---

## 2. Vue d'ensemble de tous les champs disponibles

Liste complète des 32 champs de souscription Meta (API v25.0) :

| # | Champ | Catégorie | Actuellement souscrit |
|---|-------|----------|----------------------|
| 1 | `messages` | Messagerie | ✅ **OUI** |
| 2 | `message_echoes` | Messagerie | ❌ Non |
| 3 | `smb_message_echoes` | Messagerie (SMB) | ❌ Non |
| 4 | `messaging_handovers` | Messagerie / Bot | ❌ Non |
| 5 | `calls` | Appels | ❌ Non |
| 6 | `flows` | WhatsApp Flows | ❌ Non |
| 7 | `automatic_events` | Automatisation | ❌ Non |
| 8 | `tracking_events` | Marketing / Tracking | ❌ Non |
| 9 | `account_update` | Compte | ❌ Non |
| 10 | `account_alerts` | Compte | ❌ Non |
| 11 | `account_review_update` | Compte | ❌ Non |
| 12 | `account_settings_update` | Compte | ❌ Non |
| 13 | `business_capability_update` | Compte | ❌ Non |
| 14 | `business_status_update` | Compte | ❌ Non |
| 15 | `partner_solutions` | Partenariat Meta | ❌ Non |
| 16 | `smb_app_state_sync` | Compte (SMB) | ❌ Non |
| 17 | `payment_configuration_update` | Paiement | ❌ Non |
| 18 | `history` | Historique | ❌ Non |
| 19 | `message_template_status_update` | Templates | ❌ Non |
| 20 | `message_template_quality_update` | Templates | ❌ Non |
| 21 | `message_template_components_update` | Templates | ❌ Non |
| 22 | `template_category_update` | Templates | ❌ Non |
| 23 | `template_correct_category_detection` | Templates | ❌ Non |
| 24 | `phone_number_name_update` | Numéros | ❌ Non |
| 25 | `phone_number_quality_update` | Numéros | ❌ Non |
| 26 | `group_lifecycle_update` | Groupes | ❌ Non |
| 27 | `group_participants_update` | Groupes | ❌ Non |
| 28 | `group_settings_update` | Groupes | ❌ Non |
| 29 | `group_status_update` | Groupes | ❌ Non |
| 30 | `user_preferences` | Utilisateur | ❌ Non |
| 31 | `security` | Sécurité | ❌ Non |

> **Constat** : Sur 31 champs disponibles, seul 1 est souscrit (`messages`).
> 30 champs représentent des informations que l'application ne reçoit pas du tout.

---

## 3. Champ `messages` — Messagerie principale

C'est le champ **le plus important** — il couvre toute la communication directe avec les clients.
Il regroupe deux sous-catégories : les **messages entrants** et les **statuts de livraison**.

### 3.1 Types de messages entrants

#### `text` — Message texte simple
```json
{
  "type": "text",
  "text": { "body": "Bonjour, j'ai une question", "preview_url": false }
}
```
**Ce que ça fait** : Message texte brut envoyé par le client. Si `preview_url: true`,
WhatsApp a généré un aperçu d'un lien contenu dans le message (titre, image, description).

**État actuel** : ✅ Géré — sauvegardé, dispatché vers un agent, affiché dans l'interface.

**Amélioration possible** : Exploiter `preview_url` pour afficher l'aperçu du lien
dans l'interface (comme dans WhatsApp natif).

---

#### `image` — Photo
```json
{
  "type": "image",
  "image": {
    "id": "1234567890",
    "mime_type": "image/jpeg",
    "sha256": "abc123...",
    "caption": "Voici le problème"
  }
}
```
**Ce que ça fait** : Image envoyée par le client. L'`id` est un Media ID Meta —
appeler `GET /{media-id}` pour obtenir l'URL de téléchargement (valable 5 minutes).

**État actuel** : ✅ Géré.

**Amélioration possible** : Miniature dans l'interface sans forcer le téléchargement complet.

---

#### `audio` — Message vocal / audio
```json
{
  "type": "audio",
  "audio": {
    "id": "9876543210",
    "mime_type": "audio/ogg; codecs=opus",
    "voice": true
  }
}
```
**Ce que ça fait** : Message vocal (si `voice: true`) ou fichier audio.
Les vocaux WhatsApp sont en OGG/Opus.

**État actuel** : ✅ Géré.

**Amélioration possible** : Lecteur audio inline dans l'interface agent.

---

#### `video` — Vidéo
**État actuel** : ✅ Géré.

---

#### `document` — Fichier (PDF, Word, Excel, etc.)
```json
{
  "type": "document",
  "document": {
    "id": "111222333",
    "filename": "devis.pdf",
    "mime_type": "application/pdf"
  }
}
```
**Ce que ça fait** : Fichier partagé. Le `filename` original est préservé.

**État actuel** : ✅ Géré.

**Amélioration possible** : Icône par type MIME dans l'interface (PDF, Excel, etc.).

---

#### `location` — Localisation statique
```json
{
  "type": "location",
  "location": {
    "latitude": 36.7525,
    "longitude": 3.0420,
    "name": "Alger Centre",
    "address": "1 Rue Didouche Mourad, Alger"
  }
}
```
**Ce que ça fait** : Le client partage une position géographique fixe.

**État actuel** : ✅ Géré (coordonnées sauvegardées).

**Amélioration possible** : Afficher la carte OpenStreetMap/Google Maps dans l'interface agent.

---

#### `sticker` — Autocollant WhatsApp
```json
{
  "type": "sticker",
  "sticker": {
    "id": "444555666",
    "mime_type": "image/webp",
    "animated": false
  }
}
```
**Ce que ça fait** : Sticker statique ou animé (WebP) envoyé par le client.

**État actuel** : ✅ Géré — `MetaAdapter.resolveMedia()` mappe le type `sticker`, et `ChatMessage.tsx` l'affiche comme une image WebP.

> Audit 2026-04-03 : ce type était mentionné comme ❌ dans la version précédente de ce document — c'est incorrect. L'implémentation est bien en place.

---

#### `reaction` — Réaction emoji
```json
{
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.xxxx",
    "emoji": "👍"
  }
}
```
**Ce que ça fait** : Réaction posée ou retirée (`emoji: ""`) sur un message.
Le `message_id` référence le message sur lequel la réaction est posée.

**État actuel** : ❌ Non géré. De plus, `InstagramAdapter` ignore explicitement les réactions (ligne 31 : `if (messaging.message.reactions) continue;`).

**Recommandation** : Implémenter la sauvegarde de réactions liées au message référencé
et l'affichage dans l'interface (signal d'engagement précieux). À faire pour Meta et Instagram.

---

#### `contacts` — Fiche(s) de contact partagée(s)
```json
{
  "type": "contacts",
  "contacts": [{
    "name": { "formatted_name": "Jean Dupont" },
    "phones": [{ "phone": "+33612345678", "type": "CELL" }],
    "emails": [{ "email": "jean@exemple.com" }]
  }]
}
```
**Ce que ça fait** : Le client partage une ou plusieurs fiches vCard.

**État actuel** : ❌ Non géré.

**Recommandation** : Afficher nom + numéro de façon lisible. Priorité basse.

---

#### `interactive` — Réponse à un message interactif
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": { "id": "btn_confirm", "title": "Confirmer" }
  }
}
```
**Types disponibles** : `button_reply`, `list_reply`, `nfm_reply` (pour les Flows).

**État actuel** : ✅ Géré pour `button_reply` et `list_reply`.
`nfm_reply` (réponse à un WhatsApp Flow) n'est pas encore géré.

---

#### `button` — Quick Reply sur un template HSM
```json
{
  "type": "button",
  "button": {
    "payload": "CONFIRM_ORDER_123",
    "text": "Oui, confirmer"
  }
}
```
**Ce que ça fait** : Clic sur un bouton Quick Reply d'un template envoyé.
Le `payload` contient l'identifiant configuré dans le template.

**État actuel** : ✅ Géré.

**Amélioration possible** : Utiliser le `payload` pour déclencher des actions automatiques côté backend.

---

#### `referral` — Clic depuis une publicité Meta (Click-to-WhatsApp)
```json
{
  "type": "text",
  "text": { "body": "Bonjour" },
  "referral": {
    "source_url": "https://www.facebook.com/ads/...",
    "source_type": "ad",
    "source_id": "ad_id_123",
    "headline": "Contactez-nous pour votre devis",
    "body": "Réponse en moins de 2h",
    "media_type": "image",
    "image_url": "https://cdn.example.com/pub.jpg"
  }
}
```
**Ce que ça fait** : Le champ `referral` est attaché au **premier message** d'une conversation
quand le client l'a initiée en cliquant sur une pub Facebook/Instagram avec un bouton
"Envoyer un message WhatsApp" (Click-to-WhatsApp). Ce n'est pas un `type` de message séparé —
c'est une propriété supplémentaire sur n'importe quel message (souvent `text`).

Informations contenues :
- `source_url` : URL de la publicité ou du post
- `source_type` : `ad` (publicité) ou `post` (publication organique)
- `source_id` : identifiant de la campagne/publicité
- `headline` : titre de la pub
- `body` : texte de la pub

**État actuel** : ❌ Non géré — le champ `referral` n'existe pas dans `MetaMessageBase`,
ces données sont donc complètement perdues.

**Impact business très élevé** :
- Mesurer le ROI des campagnes publicitaires directement dans l'app
- Personnaliser l'accueil ("Vous avez vu notre offre *[headline]*")
- Segmenter les conversations par campagne (dispatcher vers un agent spécialisé)
- Statistiques : combien de leads par publicité → combien convertis

**Recommandation HAUTE PRIORITÉ** : Ajouter `referral` dans `MetaMessageBase`,
sauvegarder dans la conversation, afficher dans l'interface agent + statistiques admin.

---

#### `order` — Commande via catalogue WhatsApp
```json
{
  "type": "order",
  "order": {
    "catalog_id": "123456789",
    "text": "Je veux commander",
    "product_items": [
      { "product_retailer_id": "SKU-001", "quantity": 2, "item_price": 2999, "currency": "DZD" }
    ]
  }
}
```
**Ce que ça fait** : Le client passe une commande via le catalogue WhatsApp Business.

**État actuel** : ❌ Non géré.

**Pertinence** : Dépend du modèle métier. Faible si l'app n'est pas e-commerce.

---

#### `system` — Message système WhatsApp
```json
{
  "type": "system",
  "system": {
    "type": "user_changed_number",
    "new_wa_id": "213XXXXXXXXX",
    "identity": "...",
    "customer": "212XXXXXXXXX@s.whatsapp.net"
  }
}
```
**Types système courants** :
- `user_changed_number` / `customer_changed_number` — Migration de numéro client
- Notifications liées aux groupes (création, modification)

**Ce que ça fait** : Notifications automatiques de WhatsApp sur des changements d'état.

**État actuel** : ❌ Non géré.

**Impact** : Si un client change de numéro sans traitement, deux contacts distincts existent
en base pour la même personne.

**Recommandation** : Gérer `user_changed_number` pour lier/fusionner les conversations.

---

#### `unsupported` — Type de message non supporté
```json
{
  "type": "unsupported",
  "errors": [{ "code": 131051, "title": "Message type unsupported" }]
}
```
**Ce que ça fait** : Meta envoie ce type quand un message reçu n'est pas supporté par la Cloud API.

**État actuel** : ❌ Non géré.

**Recommandation** : Afficher un placeholder "Message non supporté" dans l'interface.

---

### 3.2 Statuts de livraison

#### `sent` ✓ (coche grise)
Le message a quitté les serveurs Meta. **État actuel** : ✅ Géré — sauvegardé en base et affiché dans `ChatMessage.tsx` avec icône ✓.

#### `delivered` ✓✓ (deux coches grises)
L'appareil du destinataire a reçu le message. **État actuel** : ✅ Géré — sauvegardé et affiché avec icône ✓✓ grises.

#### `read` ✓✓ (deux coches bleues)
Le destinataire a ouvert le message. **État actuel** : ✅ Géré — sauvegardé et affiché avec icône ✓✓ bleues.

> Audit 2026-04-03 : la progression visuelle des statuts (sending → sent → delivered → read → error) est **entièrement implémentée** côté frontend dans `ChatMessage.tsx`. Ce point était listé comme lacune dans la version précédente — c'est incorrect.

#### `failed` — Échec de livraison
```json
{
  "status": "failed",
  "errors": [{
    "code": 131047,
    "title": "Re-engagement message",
    "message": "More than 24 hours have passed since the customer last replied",
    "href": "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/"
  }]
}
```
**Codes d'erreur les plus fréquents** :

| Code | Signification |
|------|--------------|
| `131026` | Numéro pas sur WhatsApp |
| `131047` | Fenêtre 24h expirée — doit utiliser un template |
| `131048` | Trop de messages non lus / signalé comme spam |
| `131051` | Type de message non supporté par le destinataire |
| `131052` | Média expiré ou non téléchargeable |
| `130429` | Rate limit (débit) atteint |
| `131000` | Erreur interne Meta |
| `100` | Paramètre invalide (ex: `phone_number_id` incorrect) |

**État actuel** : ⚠️ Partiellement géré — le statut `failed` et les codes d'erreur sont sauvegardés en base, mais **aucune traduction humaine n'est affichée** dans `ChatMessage.tsx`. L'agent voit "❌ Échec" sans explication du code d'erreur Meta.

**Amélioration critique** : Mapper les codes en messages humains dans le frontend.
L'agent doit comprendre *pourquoi* son message n'est pas parti.

---

## 4. Champs de communication avancée

<a name="message_echoes"></a>
### `message_echoes` — Copie des messages sortants
```json
{
  "field": "message_echoes",
  "value": {
    "messaging_product": "whatsapp",
    "messages": [{
      "from": "PHONE_NUMBER_ID",
      "to": "CLIENT_PHONE",
      "id": "wamid.xxx",
      "type": "text",
      "text": { "body": "Bonjour, voici votre réponse" },
      "timestamp": "1740000000"
    }]
  }
}
```
**Ce que ça fait** : Envoie une **copie de chaque message sortant** (que votre app envoie)
sous forme de webhook entrant. C'est la "version miroir" du `messages` entrant, mais pour
les messages que vous envoyez au client.

**Utilité** : Synchronisation multi-système. Si votre app envoie des messages depuis plusieurs
services ou instances, `message_echoes` permet à tous les services de rester synchronisés
sur ce qui a été envoyé.

**État actuel** : ❌ Non souscrit.

**Pertinence pour cette app** : Faible si tous les envois passent par un seul backend.
Deviendrait utile si :
- Plusieurs instances du backend envoient des messages
- Une autre app (ex: CRM externe) envoie aussi des messages au même numéro
- On veut un audit log complet y compris les messages envoyés via le dashboard Meta directement

---

<a name="smb_message_echoes"></a>
### `smb_message_echoes` — Copie messages sortants (version PME/SMB)

Variante de `message_echoes` spécifique aux comptes de type PME (Small and Medium Business).
Fonctionne de façon identique à `message_echoes`.

**État actuel** : ❌ Non souscrit. **Pertinence** : Faible (doublon de `message_echoes`).

---

<a name="messaging_handovers"></a>
### `messaging_handovers` — Transfert de conversation entre agents/bots
```json
{
  "field": "messaging_handovers",
  "value": {
    "sender": { "id": "CLIENT_PHONE" },
    "recipient": { "id": "PHONE_NUMBER_ID" },
    "timestamp": 1740000000,
    "pass_thread_control": {
      "new_owner_app_id": "APP_ID",
      "metadata": "{ \"context\": \"agent_transfer\" }"
    }
  }
}
```
**Ce que ça fait** : Protocole de "Handover" — permet de transférer le contrôle
d'une conversation entre plusieurs applications Meta (ex: bot → agent humain,
app A → app B). Les événements possibles sont :
- `pass_thread_control` — La conversation est transmise à une autre app
- `take_thread_control` — Une autre app reprend le contrôle de la conversation
- `request_thread_control` — Une app demande à prendre le contrôle

**État actuel** : ❌ Non souscrit.

**Pertinence** : Élevée si vous envisagez d'intégrer un bot (réponses automatiques)
en parallèle des agents humains. Le Handover Protocol permet au bot de passer la main
à un agent humain quand il ne sait pas répondre, et vice-versa.

**Cas d'usage concret** :
1. Bot répond aux questions simples (FAQ, horaires)
2. Le client pose une question complexe → bot appelle `pass_thread_control` vers l'app agent
3. Un agent humain reprend la conversation
4. Quand l'agent a terminé → `pass_thread_control` repart vers le bot

---

<a name="calls"></a>
### `calls` — Appels WhatsApp
```json
{
  "field": "calls",
  "value": {
    "from": "CLIENT_PHONE",
    "to": "PHONE_NUMBER_ID",
    "timestamp": "1740000000",
    "call_status": "missed" | "answered" | "ringing" | "hung_up",
    "call_duration": 0,
    "call_id": "call_id_xyz"
  }
}
```
**Ce que ça fait** : Notifie quand un client tente ou effectue un appel WhatsApp
vers le numéro business. Les statuts possibles sont :
- `ringing` — Le client appelle (sonnerie en cours)
- `answered` — L'appel a été décroché
- `missed` — Appel manqué (personne n'a décroché)
- `hung_up` — L'appelant a raccroché avant que ça décroche

> **Note importante** : La Cloud API Meta ne permet pas de *recevoir* ou *passer*
> des appels vocaux — elle notifie seulement qu'un appel a eu lieu. Les appels réels
> passent par l'infrastructure WhatsApp, pas par votre backend.

**État actuel** : ❌ Non souscrit.

**Impact significatif** :
- Si un client essaie d'appeler et tombe sur un appel manqué, il sera frustré
- Avec ce webhook, l'app peut créer automatiquement une tâche de rappel pour l'agent
- Afficher dans l'interface : "📞 Appel manqué de ce client il y a 5 min"
- Statistiques : nombre d'appels manqués par canal, heure de pointe

**Recommandation PRIORITÉ MOYENNE** : Souscrire et créer un système de notification
pour les appels manqués (ticket automatique, notification push à l'agent disponible).

---

<a name="flows"></a>
### `flows` — WhatsApp Flows
```json
{
  "field": "flows",
  "value": {
    "flow_id": "123456789",
    "invalidate_preview": true,
    "status": "PUBLISHED" | "DEPRECATED" | "BLOCKED" | "THROTTLED"
  }
}
```
**Ce que ça fait** : WhatsApp Flows est une fonctionnalité Meta permettant d'envoyer
des **formulaires interactifs** directement dans WhatsApp (ex: formulaire de prise de RDV,
questionnaire de satisfaction, saisie d'informations personnelles).
Ce webhook notifie des changements de statut d'un Flow.

Les réponses aux Flows arrivent dans le champ `messages` avec
`type: "interactive"` et `interactive.type: "nfm_reply"`.

**État actuel** : ❌ Non souscrit.

**Pertinence haute** : Les Flows pourraient remplacer les échanges textuels répétitifs.
Cas d'usage pour cette app :
- Formulaire de qualification du lead (nom, besoin, budget)
- Sélection de plage horaire pour un rendez-vous
- Questionnaire de satisfaction après la conversation
- Collecte d'informations structurées (numéro de dossier, référence commande)

Avantage : Le client remplit un formulaire natif WhatsApp sans quitter l'app.
Les données arrivent structurées, pas en texte libre.

---

<a name="automatic_events"></a>
### `automatic_events` — Événements automatiques Meta
```json
{
  "field": "automatic_events",
  "value": {
    "event": "CUSTOMER_IDENTITY_CHANGED",
    "phone_number": "+213XXXXXXXX",
    "timestamp": "1740000000"
  }
}
```
**Ce que ça fait** : Notifie d'événements automatiques générés par la plateforme Meta,
sans action manuelle de votre part. Exemples :
- Changement d'identité client détecté automatiquement
- Renouvellement automatique de token d'accès
- Synchronisation automatique de statut

**État actuel** : ❌ Non souscrit.

**Pertinence** : Faible à court terme. Utile pour les systèmes très automatisés.

---

<a name="tracking_events"></a>
### `tracking_events` — Suivi d'événements marketing
```json
{
  "field": "tracking_events",
  "value": {
    "recipient_id": "CLIENT_PHONE",
    "events": [{
      "type": "click" | "open" | "conversion",
      "timestamp": "1740000000",
      "ad_id": "ad_123"
    }]
  }
}
```
**Ce que ça fait** : Suivi des actions marketing des clients (ouvertures, clics, conversions)
liées aux campagnes publicitaires Meta. Complète les données `referral` avec un suivi
post-conversation.

**État actuel** : ❌ Non souscrit.

**Pertinence** : Élevée pour mesurer l'efficacité des campagnes publicitaires end-to-end.
Combiné avec `referral`, permet un tunnel complet : pub → message → conversion.

---

## 5. Champs de gestion de compte

<a name="account_update"></a>
### `account_update` — Mise à jour critique du compte
```json
{
  "field": "account_update",
  "value": {
    "phone_number": "+213XXXXXXXX",
    "event": "VERIFIED_ACCOUNT" | "DISABLED_ACCOUNT" | "RESTRICTION_ADDED" | "RESTRICTION_REMOVED" | "BANNED_ACCOUNT"
  }
}
```
**Ce que ça fait** : Notifie en temps réel de tout changement de statut du compte WABA :
- `VERIFIED_ACCOUNT` — Compte vérifié par Meta (insigne vert/bleu)
- `DISABLED_ACCOUNT` — Compte désactivé (tous les envois bloqués)
- `BANNED_ACCOUNT` — Compte banni définitivement
- `RESTRICTION_ADDED` — Une limite d'envoi a été réduite
- `RESTRICTION_REMOVED` — Une restriction a été levée

**État actuel** : ❌ Non souscrit.

**Impact CRITIQUE** : Si le compte est désactivé, **tous les envois de messages échouent
immédiatement**. Sans ce webhook, l'équipe ne sait pas pourquoi ça ne marche plus
et peut chercher pendant des heures un bug côté code alors que le problème vient de Meta.

**Recommandation CRITIQUE** :
- Souscrire immédiatement
- Stocker le statut Meta du compte dans `whapi_channels` (colonne `meta_account_status`)
- Déclencher une alerte immédiate (email, SMS, notification push admin) si `DISABLED_ACCOUNT` ou `BANNED_ACCOUNT`
- Afficher le statut du compte dans le panel admin avec une bannière d'alerte visible

---

<a name="account_alerts"></a>
### `account_alerts` — Alertes préventives Meta
```json
{
  "field": "account_alerts",
  "value": {
    "phone_number": "+213XXXXXXXX",
    "alert_severity": "HIGH" | "MEDIUM" | "LOW",
    "alert_type": "FLAGGED_ACCOUNT" | "RESTRICTED_ACCOUNT" | "PHONE_NUMBER_RESTRICTION" | ...
  }
}
```
**Ce que ça fait** : Alertes de prévention envoyées par Meta *avant* qu'une sanction soit appliquée.
Meta surveille les taux de signalement et avertit le propriétaire que le compte accumule
des plaintes ou approche d'une limite critique.

C'est la **"dernière chance"** — si on ignore ces alertes, la restriction ou la désactivation arrive.

**État actuel** : ❌ Non souscrit.

**Recommandation HAUTE PRIORITÉ** :
- Afficher les alertes dans le panel admin avec badge de sévérité coloré
- Logger toutes les alertes pour audit
- Envoyer un email à l'administrateur sur chaque alerte `HIGH`

---

<a name="account_review_update"></a>
### `account_review_update` — Résultat d'une révision de compte
```json
{
  "field": "account_review_update",
  "value": {
    "decision": "APPROVED" | "REJECTED",
    "rejection_reasons": ["POLICY_VIOLATION"]
  }
}
```
**Ce que ça fait** : Suite à une demande de révision (après une restriction ou un ban),
Meta envoie le résultat de l'examen.

**État actuel** : ❌ Non souscrit.

**Pertinence** : Utile pour automatiser la mise à jour du statut de compte
sans polling manuel de l'API.

---

<a name="account_settings_update"></a>
### `account_settings_update` — Mise à jour des paramètres du compte
```json
{
  "field": "account_settings_update",
  "value": {
    "phone_number": "+213XXXXXXXX",
    "messaging_policy_url": "https://example.com/privacy",
    "messaging_policy_updated": true
  }
}
```
**Ce que ça fait** : Notifie quand les paramètres du compte WABA changent
(URL de politique de confidentialité, paramètres de messagerie, etc.).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Faible. Utile uniquement si les paramètres du compte changent fréquemment.

---

<a name="business_capability_update"></a>
### `business_capability_update` — Changement des capacités business
```json
{
  "field": "business_capability_update",
  "value": {
    "max_phone_numbers_per_business": 5,
    "max_phone_numbers_per_waba": 20
  }
}
```
**Ce que ça fait** : Notifie quand les limites structurelles du compte changent
(nombre max de numéros associables).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Faible pour une app mono-numéro. Intéressant si vous gérez plusieurs WABA.

---

<a name="business_status_update"></a>
### `business_status_update` — Changement de statut du business
```json
{
  "field": "business_status_update",
  "value": {
    "business_id": "BIZ_ID",
    "status": "ACTIVE" | "RESTRICTED" | "DISABLED",
    "reason": "POLICY_VIOLATION" | "MANUAL_ACTION" | ...
  }
}
```
**Ce que ça fait** : Notifie des changements de statut au niveau du **Business Manager**
(compte parent qui contient le WABA), pas seulement du WABA lui-même. Un Business Manager
désactivé bloque toutes les apps et WABA qu'il contient.

**État actuel** : ❌ Non souscrit.

**Pertinence HAUTE** : Si le Business Manager est désactivé (souvent sans prévenir),
toutes les intégrations Meta (WhatsApp, Instagram, Messenger) s'arrêtent simultanément.
Ce webhook est le seul moyen d'être alerté immédiatement.

**Recommandation** : Souscrire en même temps que `account_update`.

---

<a name="partner_solutions"></a>
### `partner_solutions` — Événements partenaires Meta
```json
{
  "field": "partner_solutions",
  "value": {
    "event": "PARTNER_SOLUTION_ADDED" | "PARTNER_SOLUTION_REMOVED",
    "partner_solution_id": "PS_ID"
  }
}
```
**Ce que ça fait** : Notifie quand des solutions partenaires Meta sont ajoutées ou retirées
du compte. Concerne principalement les partenaires officiels Meta (BSPs).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Très faible sauf si vous êtes BSP (Business Solution Provider) agréé Meta.

---

<a name="smb_app_state_sync"></a>
### `smb_app_state_sync` — Synchronisation d'état (version PME)

Mécanisme de synchronisation d'état pour les applications PME.
Permet de maintenir la cohérence de l'état de l'application entre plusieurs instances.

**État actuel** : ❌ Non souscrit.

**Pertinence** : Faible à court terme.

---

<a name="payment_configuration_update"></a>
### `payment_configuration_update` — Mise à jour de la configuration de paiement
```json
{
  "field": "payment_configuration_update",
  "value": {
    "payment_configuration_id": "PC_ID",
    "status": "ACTIVE" | "INACTIVE",
    "update_type": "PAYMENT_METHOD_ADDED" | "PAYMENT_METHOD_REMOVED"
  }
}
```
**Ce que ça fait** : Notifie des changements dans la configuration de paiement WhatsApp Pay
(disponible dans certains pays comme l'Inde et le Brésil).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Très faible (WhatsApp Pay non disponible en Algérie/Tunisie/Maroc pour l'instant).

---

<a name="history"></a>
### `history` — Historique de conversation
```json
{
  "field": "history",
  "value": {
    "sync_type": "FULL" | "INCREMENTAL",
    "messages": [{
      "id": "wamid.xxx",
      "from": "CLIENT_PHONE",
      "to": "PHONE_NUMBER_ID",
      "timestamp": "1740000000",
      "type": "text",
      "text": { "body": "Ancien message" }
    }]
  }
}
```
**Ce que ça fait** : Permet de récupérer l'historique de messages lors d'une migration
ou d'une première connexion de l'app. Meta envoie les messages passés via ce webhook
lors d'une demande de synchronisation d'historique.

**État actuel** : ❌ Non souscrit.

**Pertinence HAUTE pour la migration** : Si vous migrez d'un numéro à un autre,
ou si un client existant se connecte à votre plateforme pour la première fois,
ce champ permet de récupérer l'historique complet des conversations passées.

**Recommandation** : À activer lors d'une migration de numéro ou d'onboarding
d'un client ayant déjà des conversations existantes.

---

## 6. Champs liés aux templates (HSM)

> Les **templates** (HSM = Highly Structured Messages) sont les seuls messages
> qu'on peut envoyer en dehors de la fenêtre de 24h. Ils doivent être soumis
> et approuvés par Meta avant utilisation.

<a name="message_template_status_update"></a>
### `message_template_status_update` — Changement de statut d'un template
```json
{
  "field": "message_template_status_update",
  "value": {
    "event": "APPROVED" | "REJECTED" | "PENDING" | "FLAGGED" | "PAUSED" | "DISABLED",
    "message_template_id": 123456789,
    "message_template_name": "confirmation_rdv",
    "message_template_language": "fr",
    "reason": "NONE" | "INCORRECT_CATEGORY" | "MISLEADING_CONTENT" | "POLICY_VIOLATION" | ...
  }
}
```
**Ce que ça fait** : Notifie en temps réel le résultat de la soumission ou révision d'un template.

Cycle de vie d'un template :
1. `PENDING` → En cours de révision par Meta
2. `APPROVED` → Prêt à l'envoi
3. `FLAGGED` → Signalé pour révision (trop de reports clients)
4. `PAUSED` → Mis en pause automatiquement (taux de signalement trop élevé)
5. `DISABLED` → Désactivé définitivement

**État actuel** : ❌ Non souscrit.

**Impact** : Un template `PAUSED` fait **échouer silencieusement tous les `MessageAuto`**
qui l'utilisent. L'app envoie une requête Meta, reçoit une erreur, mais sans ce webhook
personne ne sait que le template est en pause.

**Recommandation HAUTE PRIORITÉ** :
- Créer une table `message_templates` avec colonnes `name`, `language`, `status`, `quality_score`
- Bloquer l'utilisation d'un template `PAUSED` ou `DISABLED` dans le service `MessageAuto`
- Alerter l'admin si un template actif change de statut

---

<a name="message_template_quality_update"></a>
### `message_template_quality_update` — Score de qualité d'un template
```json
{
  "field": "message_template_quality_update",
  "value": {
    "previous_quality_score": "GREEN",
    "new_quality_score": "YELLOW" | "RED",
    "message_template_id": 123456789,
    "message_template_name": "confirmation_rdv"
  }
}
```
**Scores de qualité** :
- 🟢 `GREEN` — Bon (peu de signalements)
- 🟡 `YELLOW` — Dégradé (signalements en hausse, risque de pause à venir)
- 🔴 `RED` — Mauvais (très signalé, suspension imminente)

**Ce que ça fait** : Suivi de la santé des templates. Meta mesure les taux de signalement
("Bloquer", "Signaler") par les destinataires sur les messages générés par chaque template.

**État actuel** : ❌ Non souscrit.

**Recommandation** : Afficher le score de qualité de chaque template dans l'interface admin.
Envoyer une alerte si un template passe en `YELLOW` (signal d'avertissement précoce)
ou `RED` (action urgente requise : réviser le contenu du template).

---

<a name="message_template_components_update"></a>
### `message_template_components_update` — Modification des composants d'un template
```json
{
  "field": "message_template_components_update",
  "value": {
    "message_template_id": 123456789,
    "message_template_name": "promo_ete",
    "previous_category": "UTILITY",
    "new_category": "MARKETING"
  }
}
```
**Ce que ça fait** : Notifie quand Meta recatégorise automatiquement un template.
Depuis 2023, Meta peut forcer le changement de catégorie d'un template
(souvent `UTILITY` → `MARKETING`), ce qui **change le tarif de facturation**.

Tarifs par catégorie (approximatifs) :
- `UTILITY` : le moins cher
- `AUTHENTICATION` : prix intermédiaire
- `MARKETING` : le plus cher

**État actuel** : ❌ Non souscrit.

**Impact financier** : Une recatégorisation silencieuse peut augmenter les coûts
d'envoi de façon significative sur un volume élevé.

**Recommandation** : Logger les changements de catégorie. Alerter si un template
`UTILITY` est reclassifié en `MARKETING`.

---

<a name="template_category_update"></a>
### `template_category_update` — Mise à jour de catégorie de template
```json
{
  "field": "template_category_update",
  "value": {
    "message_template_id": 123456789,
    "message_template_name": "promo_ete",
    "previous_category": "UTILITY",
    "new_category": "MARKETING",
    "update_type": "MANUAL" | "AUTOMATIC"
  }
}
```
**Ce que ça fait** : Similaire à `message_template_components_update` mais plus ciblé
sur les changements de catégorie, qu'ils soient manuels ou automatiques.

**État actuel** : ❌ Non souscrit.

**Note** : La distinction entre ce champ et `message_template_components_update` est subtile —
les deux couvrent les changements de catégorie mais avec des niveaux de détail différents.
Il est recommandé de souscrire aux deux pour une couverture complète.

---

<a name="template_correct_category_detection"></a>
### `template_correct_category_detection` — Détection automatique de la bonne catégorie
```json
{
  "field": "template_correct_category_detection",
  "value": {
    "message_template_id": 123456789,
    "message_template_name": "promo_ete",
    "detected_category": "MARKETING",
    "submitted_category": "UTILITY"
  }
}
```
**Ce que ça fait** : Meta utilise un système d'IA pour détecter si le template soumis
correspond bien à la catégorie déclarée. Si `detected_category !== submitted_category`,
Meta peut forcer la correction.

**État actuel** : ❌ Non souscrit.

**Pertinence** : Utile pour comprendre pourquoi un template est recatégorisé.
Permet d'ajuster le contenu des templates futurs pour rester dans la bonne catégorie.

---

## 7. Champs liés aux numéros de téléphone

<a name="phone_number_quality_update"></a>
### `phone_number_quality_update` — Score de qualité et tier du numéro
```json
{
  "field": "phone_number_quality_update",
  "value": {
    "phone_number": "+213XXXXXXXX",
    "display_phone_number": "+213 XX XX XX XX",
    "event": "FLAGGED" | "UNFLAGGED",
    "current_limit": "TIER_1K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED"
  }
}
```
**Tiers de messagerie — limite de conversations initiées par jour** :

| Tier | Conversations uniques / 24h |
|------|-----------------------------|
| `TIER_1K` | 1 000 |
| `TIER_10K` | 10 000 |
| `TIER_100K` | 100 000 |
| `TIER_UNLIMITED` | Illimité |

**Ce que ça fait** : Notifie quand la qualité du numéro change ou quand le tier évolue.
- `FLAGGED` → Le numéro est signalé (trop de reports clients → tier en danger)
- `UNFLAGGED` → Le numéro n'est plus signalé (qualité revenue à la normale)
- Changement de `current_limit` → Le tier a changé (montée ou descente)

**État actuel** : ❌ Non souscrit.

**Impact HAUTE PRIORITÉ** : Si le tier descend de `TIER_10K` à `TIER_1K`,
les campagnes de messages initiés par l'entreprise sont brutalement limitées
à 1000 conversations par jour. Cela arrive sans avertissement côté Meta
sauf via ce webhook.

**Recommandation** :
- Souscrire immédiatement
- Stocker le tier actuel en base
- Afficher dans le panel admin
- Déclencher une alarme si le tier descend ou si le numéro est `FLAGGED`

---

<a name="phone_number_name_update"></a>
### `phone_number_name_update` — Mise à jour du nom d'affichage
```json
{
  "field": "phone_number_name_update",
  "value": {
    "phone_number": "+213XXXXXXXX",
    "display_phone_number": "+213 XX XX XX XX",
    "event": "APPROVED_UPDATE" | "REJECTED_UPDATE" | "PENDING_REVIEW",
    "requested_verified_name": "Mon Entreprise",
    "rejection_reason": "FLAGGED_NAME"
  }
}
```
**Ce que ça fait** : Résultat de la demande de changement du nom vérifié
(le nom qui apparaît chez les destinataires à la place du numéro).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Faible, à activer si vous changez régulièrement le nom d'affichage.

---

## 8. Champs liés aux groupes WhatsApp

> Ces champs concernent les groupes WhatsApp. Ils ne sont pertinents que si
> votre application gère des conversations de groupe (pas seulement 1-à-1).
> Dans l'état actuel, les conversations de groupe sont filtrées par
> `isValidLegacyChatId()` (rejet si `chat_id.endsWith('@g.us')`).

<a name="group_lifecycle_update"></a>
### `group_lifecycle_update` — Création / suppression de groupe
```json
{
  "field": "group_lifecycle_update",
  "value": {
    "group_id": "GROUP_ID",
    "event": "CREATED" | "DELETED",
    "created_by": "PHONE_NUMBER_ID",
    "timestamp": "1740000000"
  }
}
```
**Ce que ça fait** : Notifie quand votre numéro business crée ou supprime un groupe WhatsApp.

**État actuel** : ❌ Non souscrit. **Pertinence** : Faible (groupes filtrés dans l'app).

---

<a name="group_participants_update"></a>
### `group_participants_update` — Ajout/suppression de membres dans un groupe
```json
{
  "field": "group_participants_update",
  "value": {
    "group_id": "GROUP_ID",
    "event": "PARTICIPANT_ADDED" | "PARTICIPANT_REMOVED" | "PARTICIPANT_LEFT",
    "participants": ["+213XXXXXXXXX"],
    "timestamp": "1740000000"
  }
}
```
**Ce que ça fait** : Notifie des changements de membres dans les groupes.

**État actuel** : ❌ Non souscrit. **Pertinence** : Faible.

---

<a name="group_settings_update"></a>
### `group_settings_update` — Modification des paramètres d'un groupe
Notifie quand les paramètres d'un groupe changent (nom, description, icône,
restrictions d'envoi).

**État actuel** : ❌ Non souscrit. **Pertinence** : Faible.

---

<a name="group_status_update"></a>
### `group_status_update` — Changement de statut d'un groupe
Notifie du changement de statut global d'un groupe (actif, archivé, etc.).

**État actuel** : ❌ Non souscrit. **Pertinence** : Faible.

---

## 9. Champs de préférences utilisateur et sécurité

<a name="user_preferences"></a>
### `user_preferences` — Préférences des utilisateurs
```json
{
  "field": "user_preferences",
  "value": {
    "wa_id": "CLIENT_PHONE",
    "preferences": {
      "messaging_opt_in": true | false,
      "marketing_opt_in": true | false
    },
    "updated_at": "1740000000"
  }
}
```
**Ce que ça fait** : Notifie quand un client modifie ses préférences de communication
(opt-in / opt-out pour les messages marketing ou les notifications).

**État actuel** : ❌ Non souscrit.

**Impact RGPD / conformité** : Si un client se désinscrit des messages marketing
(`marketing_opt_in: false`), continuer à lui envoyer des templates marketing constitue
une violation des conditions d'utilisation Meta et potentiellement du RGPD.

**Recommandation MOYENNE** :
- Stocker les préférences par client dans la base
- Bloquer l'envoi de templates `MARKETING` aux clients opt-out
- Afficher dans la fiche client "Ce contact a refusé les communications marketing"

---

<a name="security"></a>
### `security` — Événements de sécurité
```json
{
  "field": "security",
  "value": {
    "partner_solutions_visibility_updated": true,
    "timestamp": "1740000000"
  }
}
```
**Ce que ça fait** : Notifications de sécurité liées au compte WABA.
Actuellement principalement utilisé pour les changements de visibilité
des solutions partenaires (qui peut voir votre WABA dans le réseau partenaires Meta).

**État actuel** : ❌ Non souscrit.

**Pertinence** : Très faible sauf si vous êtes partenaire officiel Meta.

---

## 10. Tableau récapitulatif de pertinence

### Événements dans le champ `messages`

| Type | Description | État | Priorité | Impact |
|------|-------------|------|----------|--------|
| `text` | Texte | ✅ Géré | — | — |
| `image` | Photo | ✅ Géré | — | — |
| `audio` | Audio/vocal | ✅ Géré | — | — |
| `video` | Vidéo | ✅ Géré | — | — |
| `document` | Fichier | ✅ Géré | — | — |
| `location` | Localisation | ✅ Géré | Amélioration (carte) | Moyen |
| `interactive` | Réponse interactif | ✅ Géré | — | — |
| `button` | Quick Reply template | ✅ Géré | Payload → action auto | Élevé |
| `sticker` | Autocollant WebP | ✅ Géré | — | — |
| `referral` | Clic pub Meta | ❌ Manquant | **HAUTE** | ROI publicitaire |
| `reaction` | Emoji de réaction | ❌ Manquant | **MOYENNE** | Engagement |
| `system` | Changement numéro | ❌ Manquant | **MOYENNE** | Intégrité contacts |
| `contacts` | Fiche contact | ❌ Manquant | **BASSE** | Faible |
| `order` | Commande catalogue | ❌ Manquant | **BASSE** (si pas e-com) | Faible |
| `unsupported` | Type inconnu | ❌ Manquant | **BASSE** | UX |
| `failed` status | Erreur livraison — code en base | ⚠️ Partiel | Affichage message humain manquant | **ÉLEVÉ** |
| statuts `sent`/`delivered`/`read` | Progression visuelle | ✅ Géré + affiché | — | — |

### Champs de communication avancée

| Champ | Description | État | Priorité | Impact |
|-------|-------------|------|----------|--------|
| `calls` | Appels manqués | ❌ Non souscrit | **MOYENNE** | Rappel automatique |
| `flows` | WhatsApp Flows | ❌ Non souscrit | **MOYENNE** | Formulaires natifs |
| `message_echoes` | Copie sortants | ❌ Non souscrit | **BASSE** | Sync multi-instance |
| `messaging_handovers` | Bot → agent humain | ❌ Non souscrit | **BASSE** (si pas de bot) | Moyen |
| `tracking_events` | Suivi marketing | ❌ Non souscrit | **MOYENNE** | Analytics campagnes |
| `automatic_events` | Événements auto | ❌ Non souscrit | **BASSE** | Faible |

### Champs de gestion de compte

| Champ | Description | État | Priorité | Impact |
|-------|-------------|------|----------|--------|
| `account_update` | Désactivation/restriction | ❌ Non souscrit | **🔴 CRITIQUE** | Bloquant |
| `business_status_update` | Statut Business Manager | ❌ Non souscrit | **🔴 CRITIQUE** | Bloquant |
| `account_alerts` | Alertes pré-sanction | ❌ Non souscrit | **🟠 HAUTE** | Prévention |
| `phone_number_quality_update` | Tier et qualité numéro | ❌ Non souscrit | **🟠 HAUTE** | Limite envois |
| `message_template_status_update` | Statut templates | ❌ Non souscrit | **🟠 HAUTE** | Templates inutilisables |
| `history` | Historique migration | ❌ Non souscrit | **🟡 MOYENNE** | Migration |
| `user_preferences` | Opt-in/opt-out client | ❌ Non souscrit | **🟡 MOYENNE** | RGPD |
| `message_template_quality_update` | Qualité templates | ❌ Non souscrit | **🟡 MOYENNE** | Prévention suspend |
| `account_review_update` | Résultat révision | ❌ Non souscrit | **🟢 BASSE** | Opérationnel |
| `message_template_components_update` | Recatégorisation | ❌ Non souscrit | **🟢 BASSE** | Coût financier |
| `template_category_update` | Mise à jour catégorie | ❌ Non souscrit | **🟢 BASSE** | Coût financier |
| `template_correct_category_detection` | Détection catégorie IA | ❌ Non souscrit | **🟢 BASSE** | Informatif |
| `account_settings_update` | Paramètres compte | ❌ Non souscrit | **⚪ TRÈS BASSE** | Faible |
| `business_capability_update` | Capacités business | ❌ Non souscrit | **⚪ TRÈS BASSE** | Faible |
| `phone_number_name_update` | Nom d'affichage | ❌ Non souscrit | **⚪ TRÈS BASSE** | Faible |
| `payment_configuration_update` | Paiement | ❌ Non souscrit | **⚪ TRÈS BASSE** | N/A (non dispo) |
| `smb_app_state_sync` | Sync état SMB | ❌ Non souscrit | **⚪ TRÈS BASSE** | Faible |
| `partner_solutions` | Solutions partenaires | ❌ Non souscrit | **⚪ TRÈS BASSE** | N/A |
| `security` | Sécurité partenaires | ❌ Non souscrit | **⚪ TRÈS BASSE** | N/A |

### Champs de groupes (tous non pertinents pour l'app actuelle)

| Champ | Priorité |
|-------|----------|
| `group_lifecycle_update` | ⚪ N/A |
| `group_participants_update` | ⚪ N/A |
| `group_settings_update` | ⚪ N/A |
| `group_status_update` | ⚪ N/A |
| `smb_message_echoes` | ⚪ N/A |

---

## 11. État actuel du code et lacunes identifiées

> Audit complet du code effectué le 2026-04-03.

### Ce qui fonctionne bien
- Architecture `UnifiedIngressService` + `MetaAdapter` + `InstagramAdapter` + `MessengerAdapter` propre et extensible
- 9 types de messages gérés : `text`, `image`, `audio`, `video`, `document`, `location`, `interactive`, `button`, **`sticker`** ✅
- Les 4 statuts de livraison (sent/delivered/read/failed) sauvegardés en base
- **Progression visuelle des statuts** (sending → ✓ → ✓✓ grises → ✓✓ bleues → ❌) entièrement implémentée dans `ChatMessage.tsx` ✅
- Idempotence gérée via table `WebhookIdempotency` (pas de double traitement)
- HMAC / signature Meta validée (`validateHmacSignature`)
- Guard HSM sur les templates + Dead Letter Queue ✅
- Signature HMAC Whapi + validation Joi en production ✅

### Lacunes côté traitement des messages
1. `MetaMessageBase` n'a pas de champ `referral` → données publicitaires Click-to-WhatsApp perdues
2. `interactive.type: "nfm_reply"` (réponse aux Flows) non géré
3. Statut `failed` : code d'erreur sauvegardé en base **mais aucune traduction humaine dans le frontend** — l'agent voit juste "❌ Échec"
4. `reaction` : non géré côté Meta ; `InstagramAdapter` ignore explicitement les réactions (L31)
5. `system` (changement de numéro) : non géré → doublons possibles en base
6. `contacts`, `unsupported`, `order` : non gérés (priorité basse)

### Lacunes côté monitoring de compte
1. Aucune souscription aux champs de compte → zéro visibilité sur la santé du compte Meta
2. `message_template_status_update` : **souscrit** dans `meta-token.service.ts` (L229) mais **ignoré** dans le contrôleur webhook — aucun handler, aucun stockage
3. Pas de table pour stocker l'état du compte, des templates, du tier
4. Pas de système d'alerte si compte désactivé ou restreint
5. Pas de suivi du statut des templates HSM utilisés dans `MessageAuto`

---

## 12. Recommandations priorisées

> Mis à jour suite à l'audit complet du code (2026-04-03).
> Les items ✅ dans la section 11 ont été retirés de ces recommandations car déjà implémentés.

### 🔴 Critique — Action immédiate

#### 1. Souscrire à `account_update` + `business_status_update`
Si le compte est désactivé, tous les envois échouent sans que personne ne soit prévenu.
→ Ajouter un handler dans le contrôleur webhook, stocker le statut en base, alerter par email/push.

#### 2. Afficher les messages d'erreur de livraison (statut `failed`)
Les codes d'erreur Meta sont déjà sauvegardés en base — il faut les exposer dans `ChatMessage.tsx`.
```typescript
const META_ERROR_MESSAGES: Record<number, string> = {
  131026: 'Numéro non joignable sur WhatsApp',
  131047: 'Fenêtre 24h expirée — utilisez un template',
  131048: 'Message signalé comme spam par le destinataire',
  131052: 'Fichier média expiré — renvoyez le fichier',
  130429: 'Limite de débit Meta atteinte — réessayez plus tard',
};
```

### 🟠 Haute priorité — Sprint suivant

#### 3. Brancher le handler `message_template_status_update` (déjà souscrit !)
Le webhook est déjà souscrit dans `meta-token.service.ts` (L229) mais le payload est ignoré.
→ Ajouter un handler dans `WebhookController`, stocker le statut du template, bloquer les `MessageAuto` si `PAUSED`/`DISABLED`.

#### 4. Souscrire à `phone_number_quality_update`
Surveiller le tier et la qualité du numéro. Alerter si dégradation.

#### 5. Souscrire à `account_alerts`
Alertes préventives avant restriction du compte.

#### 6. Implémenter `referral` dans `MetaMessageBase`
Sauvegarder l'origine publicitaire des conversations et l'afficher dans l'interface agent.
```typescript
// Dans MetaMessageBase
referral?: {
  source_url: string;
  source_type: 'ad' | 'post' | 'unknown';
  source_id: string;
  headline?: string;
  body?: string;
};
```

### 🟡 Priorité moyenne — Backlog priorisé

#### 7. Souscrire à `calls`
Créer des tickets de rappel automatiques pour les appels manqués.

#### 8. Implémenter `reaction`
Afficher les emojis de réaction dans l'interface (Meta + Instagram — l'adapter Instagram ignore explicitement les réactions).

#### 9. Souscrire à `user_preferences`
Respecter les opt-out marketing pour la conformité RGPD.

#### 10. Implémenter `system` (changement de numéro client)
Gérer les migrations de numéro pour éviter les doublons de contacts.

#### 11. Souscrire à `message_template_quality_update`
Alerter si un template passe en score YELLOW/RED.

#### 12. Évaluer WhatsApp Flows (`flows`)
Potentiel élevé pour remplacer les échanges textuels répétitifs par des formulaires natifs.

### 🟢 Basse priorité — Backlog futur

- `contacts` : Afficher les fiches contact partagées
- `unsupported` : Placeholder "Message non supporté" à la place de "type inconnu"
- `message_echoes` : Si multi-instance nécessaire
- `history` : Pour les migrations de numéros
- `tracking_events` : Analytics publicitaires avancées
- `template_category_update` / `message_template_components_update` : Alertes coût financier

### ✅ Déjà implémenté — Retiré des recommandations

- `sticker` : ✅ Géré dans `MetaAdapter.resolveMedia()` et affiché dans `ChatMessage.tsx`
- Progression visuelle des statuts (✓ → ✓✓ → 🔵) : ✅ Entièrement implémentée dans `ChatMessage.tsx`

---

*Document généré à partir de l'analyse du code source (NestJS / MetaAdapter / UnifiedIngressService / InstagramAdapter / MessengerAdapter)
et de la liste officielle des champs webhook Meta WhatsApp Business Platform v25.0.
Dernière mise à jour : 2026-04-03.*
