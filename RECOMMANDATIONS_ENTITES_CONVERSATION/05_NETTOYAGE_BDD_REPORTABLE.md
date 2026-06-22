# Nettoyage BDD et ameliorations reportables

## Objectif

Identifier ce qui peut etre reutilise, fusionne, ou supprime apres audit. Ce fichier ne recommande pas de supprimer immediatement : il sert a preparer un nettoyage controle.

## 1. Tables a conserver et reutiliser

### Coeur conversationnel

- `whatsapp_message`
- `whatsapp_chat`
- `chat_session`
- `whatsapp_media`
- `whapi_channels`
- `channels`
- `webhook_event_log`

### Client et dossier

- `contact`
- `contact_phone`
- `client_dossier`
- `contact_field_definition`
- `contact_field_value`
- `client_identity_mapping`
- `messaging_client_dossier_mirror`

### Rapport et cloture

- `conversation_report`
- `conversation_validation`
- `validation_criterion_config`
- `closure_attempt_log`

### Action commerciale

- `follow_up`
- `commercial_action_task`
- `commercial_daily_performance`
- `commercial_target`
- `call_log`
- `call_event`
- `missed_call_event`

### Audit, integration et analytics

- `audit_log`
- `integration_outbox`
- `integration_sync_log`
- `analytics_snapshot`
- `sla_rule`

## 2. Tables probablement legacy a auditer avant suppression

Ces tables portent deja le prefixe `_legacy_` :

- `_legacy_auto_message_keyword`
- `_legacy_auto_message_scope_config`
- `_legacy_messages_predefinis`

Recommandation :

1. verifier absence de lecture/ecriture dans le code ;
2. exporter le contenu ;
3. comparer avec les tables actuelles `flow_*`, `canned_response`, `cron_config`, `media_asset` ;
4. supprimer seulement apres une periode de gel.

## 3. Tables potentiellement redondantes

### `channels` et `whapi_channels`

Observation :

- `channels` semble representer un modele provider generique.
- `whapi_channels` porte beaucoup de details operationnels historiques et provider.

Recommandation :

- ne pas supprimer ;
- definir une cible :
  - `channels` = abstraction provider generique ;
  - `whapi_channels` = details techniques/connecteurs historiques, a migrer progressivement.

### `whatsapp_chat_label`, `label`, `chat_label_assignment`

Observation :

- `whatsapp_chat_label` ressemble a l'ancien modele.
- `label` + `chat_label_assignment` ressemble au modele normalise.

Recommandation :

- privilegier `label` + `chat_label_assignment` ;
- auditer l'usage de `whatsapp_chat_label` ;
- migrer puis supprimer seulement si plus utilise.

### `whatsapp_contact`, `whatsapp_customer`, `contact`

Observation :

- `contact` est le modele riche actuel.
- `whatsapp_contact` semble lie aux contacts envoyes dans des messages.
- `whatsapp_customer` semble ancien ou peu riche.

Recommandation :

- garder `contact` comme source principale.
- garder `whatsapp_contact` seulement si elle represente des vCards/messages de contact.
- auditer `whatsapp_customer` avant suppression.

### `whatsapp_error`

Observation :

- `whatsapp_message` stocke deja `error_code` et `error_title`.
- une future table `message_delivery_event` ou `message_error_event` serait plus utile.

Recommandation :

- auditer l'usage de `whatsapp_error`.
- si non utilisee, remplacer par une table d'evenements message ou par `audit_log`.

## 4. Tables a ne pas supprimer meme si elles semblent secondaires

- `webhook_event_log` : utile pour deduplication webhook.
- `integration_outbox` : utile pour fiabiliser la synchronisation.
- `integration_sync_log` : utile pour diagnostiquer les rejets externes.
- `audit_log` : base d'audit transversale.
- `conversation_validation` : utile pour cloture controlee.
- `closure_attempt_log` : utile pour comprendre les blocages de fermeture.
- `messaging_client_dossier_mirror` : utile si une integration externe depend du miroir.

## 5. Ameliorations reportables

### Nommage et encodage

Reportable mais souhaitable :

- corriger les commentaires encodes ;
- harmoniser `createdAt` / `created_at` ;
- harmoniser `deletedAt` / `deleted_at` ;
- corriger les fautes comme `messageCnntent`.

### Suppression des colonnes legacy

Reportable :

- `whatsapp_message.message_id`
- `whatsapp_message.external_id`
- champs doublons dans `conversation_report`
- champs snapshots si `ClientDossier` devient source consolidee

Condition : uniquement apres migration applicative et backfill.

### Refonte FK internes

Reportable mais importante :

- remplacer progressivement les relations basees sur `chat_id` externe par `whatsapp_chat.id`.
- ajouter `whatsapp_chat_id` dans les tables qui utilisent uniquement `chat_id`.

Tables concernees :

- `conversation_report`
- `conversation_validation`
- `closure_attempt_log`
- `follow_up`
- `campaign_link_click`
- `contact_assignment_affinity`

## 6. Ordre recommande de nettoyage

1. Auditer les usages code avec `rg`.
2. Auditer les volumes serveur.
3. Renommer les tables candidates en `_legacy_*` si ce n'est pas deja fait.
4. Laisser une periode d'observation.
5. Exporter les donnees.
6. Supprimer seulement apres validation.

## 7. Conclusion

Le nettoyage BDD est utile, mais il n'est pas urgent par rapport a la securisation des trois entites centrales.

La priorite doit rester :

- clarifier les sources de verite ;
- ajouter reconciliation ;
- renforcer les identifiants ;
- mieux utiliser `Contact`, `ConversationReport`, `ClientDossier` et `FollowUp`.
