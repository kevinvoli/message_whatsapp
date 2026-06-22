# Structure des entites - Ce qu'il faut garder et deplacer progressivement

## Objectif

Stabiliser le modele autour de trois responsabilites :

- `WhatsappMessage` : historique des faits.
- `WhatsappChat` : projection operationnelle courante.
- `ChatSession` : cycle temporel et fenetres de traitement.

## 1. `WhatsappMessage`

### A garder dans `WhatsappMessage`

Ces champs appartiennent naturellement au message :

- `id`
- `tenant_id`
- `provider`
- `provider_message_id`
- `chat_id`
- `channel_id`
- `direction`
- `from_me`
- `sender_phone`
- `sender_name`
- `timestamp`
- `type`
- `texte`
- `status` courant
- `source`
- `contact_id`
- `commercial_id`
- `poste_id`
- `dedicated_channel_id`
- `quoted_message_id`
- `createdAt`, `updatedAt`, `deletedAt`

### A garder temporairement mais cadrer

- `message_id`
- `external_id`

Ces champs doivent rester pour compatibilite, mais ne doivent plus etre la source principale de deduplication.

### A deplacer progressivement

#### Lecture commerciale

Champs actuels :

- `read_by_commercial_id`
- `read_by_commercial_at`

Proposition :

- creer `message_read_receipt`
- colonnes : `id`, `message_id`, `chat_id`, `commercial_id`, `poste_id`, `read_at`, `source`

Raison : permet plusieurs lectures, audit, collaboration et stats plus fiables.

#### Statuts provider successifs

Champ actuel :

- `status`
- `error_code`
- `error_title`

Proposition :

- garder `status` comme statut courant ;
- creer `message_delivery_event`
- colonnes : `id`, `message_id`, `provider`, `provider_message_id`, `status`, `error_code`, `error_title`, `received_at`, `payload_hash`

Raison : ne pas perdre l'historique des statuts provider.

#### Analyse IA

Champs actuels :

- `sentiment_score`
- `sentiment_label`

Proposition :

- creer `message_analysis`
- colonnes : `id`, `message_id`, `analysis_type`, `label`, `score`, `payload_json`, `model`, `created_at`

Raison : une seule analyse sentiment ne suffira pas si on ajoute classification, resume, intention, objections.

## 2. `WhatsappChat`

### A garder dans `WhatsappChat`

Ces champs sont utiles pour l'affichage, le dispatch et le temps reel :

- `id`
- `tenant_id`
- `chat_id`
- `name`
- `contact_client`
- `type`
- `poste_id`
- `channel_id`
- `last_msg_client_channel_id`
- `status`
- `unread_count`
- `read_only`
- `not_spam`
- `last_activity_at`
- `assigned_at`
- `assigned_mode`
- `is_pinned`
- `is_muted`
- `mute_until`
- `is_archived`
- `is_locked`
- `is_priority`
- `active_session_id`
- `window_expires_at`
- `window_slot`
- `window_status`
- `outbound_message_count`

### A garder comme cache denormalise

Ces champs peuvent rester dans `WhatsappChat`, mais doivent etre declares comme caches :

- `unread_count`
- `last_activity_at`
- `last_client_message_at`
- `last_poste_message_at`
- `window_expires_at`
- `last_window_reminder_sent_at`
- `active_session_id`

Ils doivent pouvoir etre reconstruits depuis `WhatsappMessage` et `ChatSession`.

### A deplacer progressivement

#### Transitions de statut conversation

Champs concernes :

- `status`
- `reopened_at`
- `conversation_result`
- `conversation_result_at`
- `conversation_result_by`

Proposition :

- garder le statut courant dans `WhatsappChat`;
- creer `conversation_status_event` ou utiliser `audit_log`.

Colonnes suggerees :

- `id`
- `chat_id`
- `whatsapp_chat_id`
- `old_status`
- `new_status`
- `reason`
- `actor_id`
- `actor_type`
- `created_at`

#### Resultat metier

`conversation_result` peut rester dans `WhatsappChat` comme resume courant, mais le detail doit rester dans `conversation_report`.

Regle :

- `conversation_report` = rapport detaille.
- `whatsapp_chat.conversation_result` = projection rapide pour filtres et statistiques.

## 3. `ChatSession`

### A garder dans `ChatSession`

Ces champs representent bien le cycle temporel :

- `id`
- `whatsapp_chat_id`
- `started_at`
- `ended_at`
- `is_ctwa`
- `ctwa_referral_id`
- `campaign_name`
- `campaign_image_url`
- `last_client_message_at`
- `last_poste_message_at`
- `service_window_expires_at`
- `free_entry_expires_at`
- `auto_close_at`
- `last_window_reminder_sent_at`

### A ajouter progressivement

- `tenant_id`
- `close_reason`
- `closed_by`
- `created_at`
- `updated_at`

### A deplacer progressivement

Rien d'important a deplacer depuis `ChatSession` aujourd'hui. Cette entite est plutot trop petite que trop grosse.

La priorite est de la rendre plus robuste :

- indexer les sessions actives ;
- garantir une seule session active par chat ;
- synchroniser proprement avec `WhatsappChat`.

## 4. Regle d'architecture cible

### Sources de verite

- Messages : `WhatsappMessage`
- Conversation courante : `WhatsappChat`
- Fenetres et episodes : `ChatSession`
- Rapport commercial : `ConversationReport`
- Identite client : `Contact`
- Dossier enrichi client : `ClientDossier`
- Actions futures : `FollowUp` et `CommercialActionTask`
- Audit : `audit_log` ou tables d'evenements dediees

### Caches acceptes

Dans `WhatsappChat` :

- `unread_count`
- `last_activity_at`
- `window_expires_at`
- `active_session_id`
- `conversation_result`

Mais chaque cache doit avoir une source reconstructible.
