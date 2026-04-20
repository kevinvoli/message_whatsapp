# Schéma Cible de Base de Données

Date: 20 avril 2026

Objectif:
- proposer un schéma de données cible pour faire évoluer la plateforme actuelle vers un suivi client complet "type banque"
- réutiliser le maximum du socle existant
- éviter une refonte destructrice du backend conversationnel

Périmètre source analysé:
- `message_whatsapp/src/contact`
- `message_whatsapp/src/call-log`
- `message_whatsapp/src/crm`
- `message_whatsapp/src/whatsapp_chat`
- `message_whatsapp/src/whatsapp_message`
- `message_whatsapp/src/whatsapp_commercial`
- `message_whatsapp/src/sla`
- `message_whatsapp/src/audit`

---

## 1. Principes de conception

Le schéma cible doit respecter 5 principes.

### 1. Le client devient l'objet maître

Aujourd'hui, l'objet pivot réel est proche du `contact` conversationnel. Ce n'est pas suffisant.

Le pivot cible doit être:
- `customer`

Le reste s'organise autour de lui:
- identités de contact
- conversations
- dossiers
- tâches
- documents
- événements relationnels

### 2. Les conversations restent une couche d'interaction, pas le centre métier

Les objets existants `whatsapp_chat` et `whatsapp_message` restent utiles, mais ils doivent devenir des sources d'interaction liées au client et à ses dossiers.

### 3. Le suivi relationnel doit être traçable

Toute action importante doit pouvoir être historisée:
- interaction
- appel
- note
- document
- statut
- tâche
- décision
- affectation
- escalade

### 4. Le schéma doit être multi-tenant et gouvernable

Chaque nouvelle table doit intégrer:
- `tenant_id`
- `created_at`
- `updated_at`
- `deleted_at` si soft delete pertinent
- `created_by` / `updated_by` quand la responsabilité métier importe

### 5. Les champs CRM custom restent une couche d'extension

Ils ne remplacent pas le modèle métier. Ils viennent au-dessus d'un noyau fort.

---

## 2. Lecture de l'existant

## 2.1. Ce qu'il faut conserver

### Tables / domaines à garder
- `contact`
- `call_log`
- `contact_field_definition`
- `contact_field_value`
- `whatsapp_chat`
- `whatsapp_message`
- `whatsapp_media`
- `whatsapp_commercial`
- `sla_rule`
- `audit_log`

### Pourquoi les garder
- `contact` contient déjà des données de qualification et d'appel
- `call_log` est une bonne base d'historique vocal
- les champs CRM custom sont déjà là
- le moteur conversationnel repose sur `whatsapp_chat` et `whatsapp_message`
- les commerciaux, SLA et audits existent déjà

## 2.2. Problème principal du modèle actuel

Le schéma actuel ne distingue pas clairement:
- l'identité conversationnelle
- le client métier
- le dossier métier
- l'action de suivi

Conséquence:
- trop d'information est concentrée dans `contact`
- le suivi dépend trop du chat
- il manque les concepts structurants

---

## 3. Vue d'ensemble du modèle cible

Le modèle cible s'articule autour de 8 domaines.

### Domaine 1. Référentiel client
- `customer`
- `customer_identity`
- `customer_household`
- `customer_owner`
- `customer_segment`

### Domaine 2. Suivi relationnel
- `interaction_event`
- `customer_note`
- `call_log` (conservé et relié)

### Domaine 3. Dossiers / cases
- `customer_case`
- `case_type`
- `case_status_history`
- `case_participant`

### Domaine 4. Tâches et relances
- `follow_up_task`
- `task_status_history`
- `task_template`

### Domaine 5. Documents et conformité
- `customer_document`
- `document_type`
- `document_review`
- `customer_consent`
- `customer_kyc_profile`

### Domaine 6. Produits / portefeuille
- `customer_product`
- `customer_account`
- `customer_relationship_summary`

### Domaine 7. Risque et alertes métier
- `customer_risk_flag`
- `customer_alert`
- `service_entitlement`

### Domaine 8. Extension personnalisable
- `contact_field_definition` et `contact_field_value`
ou à terme:
- `customer_field_definition`
- `customer_field_value`

---

## 4. Schéma cible recommandé

## 4.1. `customer`

Objet maître du suivi relationnel.

### Rôle
- représente le client métier
- sert de point d'ancrage à tous les éléments de suivi

### Colonnes recommandées
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `customer_code` VARCHAR(50) NULL
- `external_ref` VARCHAR(100) NULL
- `customer_type` ENUM('individual','business') NOT NULL
- `status` ENUM('lead','prospect','active','inactive','blocked','closed') NOT NULL
- `lifecycle_stage` ENUM('new','qualified','onboarding','active','dormant','lost') NOT NULL
- `display_name` VARCHAR(255) NOT NULL
- `first_name` VARCHAR(120) NULL
- `last_name` VARCHAR(120) NULL
- `business_name` VARCHAR(255) NULL
- `primary_phone` VARCHAR(50) NULL
- `primary_email` VARCHAR(255) NULL
- `date_of_birth` DATE NULL
- `nationality` VARCHAR(100) NULL
- `preferred_language` VARCHAR(20) NULL
- `segment_id` UUID NULL
- `household_id` UUID NULL
- `portfolio_owner_id` UUID NULL
- `branch_code` VARCHAR(50) NULL
- `region_code` VARCHAR(50) NULL
- `risk_level` ENUM('low','medium','high','critical') NULL
- `kyc_status` ENUM('not_started','pending','partial','validated','expired','rejected') NULL
- `next_action_at` DATETIME NULL
- `last_interaction_at` DATETIME NULL
- `source` VARCHAR(100) NULL
- `is_vip` BOOLEAN NOT NULL DEFAULT FALSE
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL
- `deleted_at` DATETIME NULL

### Index
- `IDX_customer_tenant_status` (`tenant_id`, `status`)
- `IDX_customer_tenant_owner` (`tenant_id`, `portfolio_owner_id`)
- `IDX_customer_tenant_next_action` (`tenant_id`, `next_action_at`)
- `IDX_customer_tenant_risk` (`tenant_id`, `risk_level`)
- `IDX_customer_tenant_last_interaction` (`tenant_id`, `last_interaction_at`)
- `UQ_customer_tenant_code` (`tenant_id`, `customer_code`)

### Justification
Cette table évite de mettre dans `contact` des notions bancaires, portefeuille, KYC, risque, ownership, cycle de vie.

---

## 4.2. `customer_identity`

Table de liaison entre le client métier et ses identités de contact ou d'entrée.

### Rôle
- gérer plusieurs identités par client
- relier numéro WhatsApp, email, téléphone, identifiant externe, chat identity

### Colonnes recommandées
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `customer_id` UUID NOT NULL FK -> `customer.id`
- `identity_type` ENUM('phone','email','whatsapp_chat','external_system','telegram','messenger','instagram') NOT NULL
- `identity_value` VARCHAR(255) NOT NULL
- `channel_id` VARCHAR(100) NULL
- `is_primary` BOOLEAN NOT NULL DEFAULT FALSE
- `is_verified` BOOLEAN NOT NULL DEFAULT FALSE
- `verified_at` DATETIME NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

### Index
- `IDX_ci_customer` (`customer_id`)
- `IDX_ci_tenant_type_value` (`tenant_id`, `identity_type`, `identity_value`)
- `UQ_ci_tenant_type_value` (`tenant_id`, `identity_type`, `identity_value`)

### Justification
Aujourd'hui, `contact.phone` et `contact.chat_id` portent cette responsabilité. Cette table permet de gérer proprement:
- multi-numéros
- multi-canaux
- déduplication
- rapprochement identité -> client

---

## 4.3. `customer_household`

Optionnel mais très utile en contexte banque / assurance / entreprise familiale.

### Colonnes
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `name` VARCHAR(255) NOT NULL
- `household_type` ENUM('family','business_group','other') NOT NULL
- `manager_customer_id` UUID NULL
- `created_at`
- `updated_at`

### Usage
- foyer
- PME / groupe
- relation de compte joint
- relation parent/enfant / conjoint

---

## 4.4. `customer_segment`

### Colonnes
- `id` UUID PK
- `tenant_id`
- `code` VARCHAR(50)
- `label` VARCHAR(100)
- `priority_level` INT
- `sla_profile_code` VARCHAR(50) NULL
- `is_vip` BOOLEAN DEFAULT FALSE

### Usage
- retail
- premium
- corporate
- high net worth
- dormant
- risque élevé

---

## 4.5. `customer_owner`

Historique de propriété relationnelle.

### Colonnes
- `id` UUID PK
- `tenant_id`
- `customer_id` UUID FK
- `commercial_id` UUID FK -> `whatsapp_commercial.id`
- `role` ENUM('owner','backup','supervisor','case_manager')
- `start_at` DATETIME
- `end_at` DATETIME NULL
- `is_current` BOOLEAN
- `assigned_by` UUID NULL
- `created_at`

### Justification
Ne pas stocker seulement un `portfolio_owner_id` direct. Il faut aussi tracer l'historique.

---

## 4.6. `customer_case`

Objet central pour le suivi bancaire.

### Rôle
- matérialiser une demande, un dossier, une réclamation, un incident, une opportunité

### Colonnes recommandées
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `customer_id` UUID NOT NULL FK -> `customer.id`
- `case_number` VARCHAR(50) NOT NULL
- `case_type_id` UUID NOT NULL
- `status` ENUM('open','in_progress','waiting_customer','waiting_internal','pending_validation','resolved','closed','cancelled','rejected') NOT NULL
- `priority` ENUM('low','medium','high','critical') NOT NULL
- `severity` ENUM('minor','major','sensitive','regulatory') NULL
- `title` VARCHAR(255) NOT NULL
- `description` TEXT NULL
- `origin_channel` VARCHAR(50) NULL
- `origin_chat_id` UUID NULL
- `owner_commercial_id` UUID NULL
- `supervisor_id` UUID NULL
- `sla_rule_id` UUID NULL
- `opened_at` DATETIME NOT NULL
- `target_resolution_at` DATETIME NULL
- `resolved_at` DATETIME NULL
- `closed_at` DATETIME NULL
- `last_activity_at` DATETIME NULL
- `resolution_code` VARCHAR(50) NULL
- `resolution_note` TEXT NULL
- `requires_validation` BOOLEAN NOT NULL DEFAULT FALSE
- `is_sensitive` BOOLEAN NOT NULL DEFAULT FALSE
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

### Index
- `UQ_case_tenant_number` (`tenant_id`, `case_number`)
- `IDX_case_tenant_customer` (`tenant_id`, `customer_id`)
- `IDX_case_tenant_status_priority` (`tenant_id`, `status`, `priority`)
- `IDX_case_tenant_owner` (`tenant_id`, `owner_commercial_id`)
- `IDX_case_tenant_target_resolution` (`tenant_id`, `target_resolution_at`)

### Justification
Sans cette table, vous confondez conversation et dossier.

---

## 4.7. `case_type`

### Colonnes
- `id` UUID PK
- `tenant_id`
- `code`
- `label`
- `category` ENUM('service','sales','risk','compliance','support','claim')
- `default_priority`
- `default_sla_rule_id` NULL
- `requires_document_check` BOOLEAN
- `requires_validation` BOOLEAN
- `is_active` BOOLEAN

### Usage
- onboarding
- réclamation
- mise à jour KYC
- incident de paiement
- demande produit
- renouvellement

---

## 4.8. `case_status_history`

### Colonnes
- `id`
- `tenant_id`
- `case_id`
- `from_status`
- `to_status`
- `changed_by`
- `change_reason`
- `meta` JSON NULL
- `created_at`

### Justification
Indispensable pour audit fonctionnel fin.

---

## 4.9. `follow_up_task`

La table clé pour le suivi opérationnel quotidien.

### Colonnes recommandées
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `customer_id` UUID NOT NULL FK -> `customer.id`
- `case_id` UUID NULL FK -> `customer_case.id`
- `task_type` ENUM('call','message','document_request','review','appointment','validation','follow_up','escalation','reminder') NOT NULL
- `status` ENUM('todo','in_progress','done','cancelled','blocked','overdue') NOT NULL
- `priority` ENUM('low','medium','high','critical') NOT NULL
- `title` VARCHAR(255) NOT NULL
- `description` TEXT NULL
- `owner_commercial_id` UUID NULL
- `backup_owner_id` UUID NULL
- `due_at` DATETIME NULL
- `started_at` DATETIME NULL
- `completed_at` DATETIME NULL
- `completion_result` VARCHAR(100) NULL
- `origin` ENUM('manual','workflow','sla','system','case_rule') NOT NULL
- `template_code` VARCHAR(50) NULL
- `next_recurrence_at` DATETIME NULL
- `is_recurring` BOOLEAN NOT NULL DEFAULT FALSE
- `is_customer_visible` BOOLEAN NOT NULL DEFAULT FALSE
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

### Index
- `IDX_task_tenant_owner_status_due` (`tenant_id`, `owner_commercial_id`, `status`, `due_at`)
- `IDX_task_tenant_customer` (`tenant_id`, `customer_id`)
- `IDX_task_tenant_case` (`tenant_id`, `case_id`)
- `IDX_task_tenant_due` (`tenant_id`, `due_at`)

### Justification
Aujourd'hui, le suivi est trop implicite. Cette table le rend pilotable.

---

## 4.10. `task_status_history`

### Colonnes
- `id`
- `tenant_id`
- `task_id`
- `from_status`
- `to_status`
- `changed_by`
- `comment`
- `created_at`

---

## 4.11. `interaction_event`

Timeline métier unifiée.

### Rôle
agréger tous les événements du parcours client dans une table de timeline commune

### Colonnes recommandées
- `id` UUID PK
- `tenant_id` CHAR(36) NOT NULL
- `customer_id` UUID NOT NULL
- `case_id` UUID NULL
- `task_id` UUID NULL
- `contact_id` UUID NULL
- `chat_id` UUID NULL
- `message_id` UUID NULL
- `call_log_id` UUID NULL
- `document_id` UUID NULL
- `event_type` ENUM(
  'message_in',
  'message_out',
  'call_made',
  'call_result',
  'note_added',
  'task_created',
  'task_completed',
  'case_opened',
  'case_status_changed',
  'document_received',
  'document_validated',
  'document_rejected',
  'sla_warning',
  'sla_breach',
  'assignment_changed',
  'consent_updated',
  'risk_flag_added',
  'risk_flag_closed',
  'system_alert'
) NOT NULL
- `channel` VARCHAR(50) NULL
- `direction` ENUM('in','out','internal') NULL
- `actor_type` ENUM('commercial','admin','system','customer') NULL
- `actor_id` UUID NULL
- `summary` VARCHAR(255) NOT NULL
- `details` TEXT NULL
- `payload` JSON NULL
- `event_at` DATETIME NOT NULL
- `created_at` DATETIME NOT NULL

### Index
- `IDX_ie_tenant_customer_event_at` (`tenant_id`, `customer_id`, `event_at`)
- `IDX_ie_tenant_case_event_at` (`tenant_id`, `case_id`, `event_at`)
- `IDX_ie_tenant_type_event_at` (`tenant_id`, `event_type`, `event_at`)

### Justification
Cette table est fondamentale. Elle transforme la plateforme en système de suivi relationnel.

---

## 4.12. `customer_note`

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `case_id` NULL
- `visibility` ENUM('private','team','supervisor')
- `title` NULL
- `body` TEXT NOT NULL
- `author_id`
- `created_at`
- `updated_at`

### Justification
Les notes d'appel ne suffisent pas. Il faut des notes métier génériques.

---

## 4.13. `document_type`

### Colonnes
- `id`
- `tenant_id`
- `code`
- `label`
- `category` ENUM('identity','address','income','contract','consent','compliance','other')
- `required_for_case_type_id` NULL
- `validity_days` NULL
- `is_mandatory` BOOLEAN
- `is_active` BOOLEAN

---

## 4.14. `customer_document`

### Colonnes recommandées
- `id`
- `tenant_id`
- `customer_id`
- `case_id` NULL
- `document_type_id`
- `storage_provider` VARCHAR(50)
- `storage_key` VARCHAR(500)
- `original_filename` VARCHAR(255)
- `mime_type` VARCHAR(100)
- `file_size_bytes` BIGINT NULL
- `status` ENUM('requested','received','under_review','validated','rejected','expired','withdrawn')
- `received_at` DATETIME NULL
- `reviewed_at` DATETIME NULL
- `reviewed_by` UUID NULL
- `expires_at` DATETIME NULL
- `rejection_reason` TEXT NULL
- `meta` JSON NULL
- `created_at`
- `updated_at`
- `deleted_at`

### Index
- `IDX_doc_tenant_customer_status` (`tenant_id`, `customer_id`, `status`)
- `IDX_doc_tenant_case` (`tenant_id`, `case_id`)
- `IDX_doc_tenant_expires_at` (`tenant_id`, `expires_at`)

---

## 4.15. `document_review`

### Colonnes
- `id`
- `tenant_id`
- `document_id`
- `reviewer_id`
- `decision` ENUM('approved','rejected','request_more_info')
- `comment`
- `created_at`

### Justification
Permet la traçabilité de la revue documentaire.

---

## 4.16. `customer_kyc_profile`

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `status` ENUM('not_started','pending','partial','validated','expired','rejected')
- `risk_classification` ENUM('low','medium','high','critical') NULL
- `last_review_at` DATETIME NULL
- `next_review_at` DATETIME NULL
- `pep_flag` BOOLEAN DEFAULT FALSE
- `sanction_flag` BOOLEAN DEFAULT FALSE
- `source_of_funds_status` ENUM('unknown','pending','validated','rejected') NULL
- `address_verified` BOOLEAN DEFAULT FALSE
- `identity_verified` BOOLEAN DEFAULT FALSE
- `notes` TEXT NULL
- `created_at`
- `updated_at`

### Justification
Évite de dissoudre le KYC dans 20 champs génériques.

---

## 4.17. `customer_consent`

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `consent_type` ENUM('marketing','profiling','data_sharing','electronic_signature','whatsapp_contact')
- `status` ENUM('granted','revoked','pending','expired')
- `granted_at`
- `revoked_at`
- `source_channel`
- `proof_ref`
- `meta` JSON NULL
- `created_at`

---

## 4.18. `customer_account`

Si vous voulez un comportement proche banque, il faut séparer le client de ses comptes ou références contractuelles.

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `account_type` ENUM('current','savings','loan','card','wallet','business','other')
- `account_number_masked` VARCHAR(50) NULL
- `external_account_ref` VARCHAR(100) NULL
- `status` ENUM('active','inactive','blocked','closed')
- `opened_at` DATETIME NULL
- `closed_at` DATETIME NULL
- `currency_code` VARCHAR(10) NULL
- `created_at`
- `updated_at`

---

## 4.19. `customer_product`

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `case_id` NULL
- `product_code`
- `product_label`
- `product_type`
- `status`
- `subscribed_at`
- `maturity_at` NULL
- `amount_value` DECIMAL(18,2) NULL
- `currency_code` VARCHAR(10) NULL
- `meta` JSON NULL
- `created_at`
- `updated_at`

### Usage
- crédit
- carte
- assurance
- épargne
- produit digital

---

## 4.20. `customer_risk_flag`

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `case_id` NULL
- `flag_type` ENUM('follow_up_delay','kyc_missing','complaint_sensitive','fraud_suspected','vip_unserved','document_expired','other')
- `severity` ENUM('low','medium','high','critical')
- `status` ENUM('open','monitoring','resolved','dismissed')
- `title`
- `description`
- `opened_at`
- `resolved_at` NULL
- `owner_id` NULL
- `created_by`
- `created_at`
- `updated_at`

---

## 4.21. `customer_alert`

Alerte de travail opérationnelle, plus légère qu'un risk flag.

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `case_id` NULL
- `task_id` NULL
- `alert_type`
- `severity`
- `status`
- `message`
- `due_at` NULL
- `created_at`
- `resolved_at` NULL

---

## 4.22. `service_entitlement`

Pour porter une logique SLA plus proche banque/service.

### Colonnes
- `id`
- `tenant_id`
- `customer_id`
- `segment_id` NULL
- `service_level_code`
- `label`
- `first_response_target_sec`
- `resolution_target_sec`
- `reengagement_target_sec`
- `valid_from`
- `valid_to` NULL
- `is_active`
- `created_at`
- `updated_at`

### Justification
Le SLA actuel existe, mais cette table permet d'affecter un niveau de service au client lui-même.

---

## 5. Réutilisation des tables existantes

## 5.1. `contact`

### Recommandation
Ne pas supprimer immédiatement `contact`.

Le faire évoluer vers un rôle transitoire:
- identité conversationnelle enrichie
- zone de compatibilité avec le front actuel

### Évolution recommandée
Ajouter progressivement:
- `customer_id` UUID NULL
- `tenant_id` si absent dans les usages métier
- `is_primary_identity` BOOLEAN

### À terme
Deux options:

#### Option A
`contact` devient une vue legacy ou une projection technique du client.

#### Option B
`contact` devient `customer_identity_contact`, spécialisé sur les canaux conversationnels.

Recommandation:
- Option A à court terme
- refonte complète seulement après stabilisation du domaine `customer`

## 5.2. `call_log`

### Recommandation
Conserver la table.

### Ajouts recommandés
- `tenant_id`
- `customer_id` UUID NULL puis NOT NULL après migration
- `case_id` UUID NULL
- `task_id` UUID NULL

### Pourquoi
Elle est déjà une bonne source pour `interaction_event`.

## 5.3. `contact_field_definition` / `contact_field_value`

### Recommandation
Conserver pour le moment.

### Évolution
Deux pistes:

#### Piste 1
Conserver les tables actuelles et les relier au `contact` tant que le front n'est pas migré.

#### Piste 2
Créer plus tard:
- `customer_field_definition`
- `customer_field_value`

Recommandation:
- ne pas migrer tout de suite
- réserver ce chantier à une phase 2 ou 3

## 5.4. `whatsapp_chat`

### Recommandation
Conserver.

### Ajout recommandé
- `customer_id` UUID NULL
- `case_id` UUID NULL

### Pourquoi
Pour rattacher la conversation au client et éventuellement à un dossier actif.

## 5.5. `whatsapp_message`

### Recommandation
Conserver.

### Ajout recommandé
- `customer_id` UUID NULL
- `case_id` UUID NULL

### Usage
Facilite:
- timeline client
- timeline dossier
- analytics relationnels

---

## 6. Relations principales

## 6.1. Graphe relationnel

### Relation centrale
- `customer` 1 -> N `customer_identity`
- `customer` 1 -> N `customer_case`
- `customer` 1 -> N `follow_up_task`
- `customer` 1 -> N `interaction_event`
- `customer` 1 -> N `customer_document`
- `customer` 1 -> N `customer_account`
- `customer` 1 -> N `customer_product`
- `customer` 1 -> N `customer_risk_flag`
- `customer` 1 -> N `customer_consent`

### Relation dossier
- `customer_case` 1 -> N `follow_up_task`
- `customer_case` 1 -> N `interaction_event`
- `customer_case` 1 -> N `customer_document`
- `customer_case` 1 -> N `case_status_history`

### Relation activité
- `call_log` N -> 1 `customer`
- `whatsapp_chat` N -> 1 `customer`
- `whatsapp_message` N -> 1 `customer`

---

## 7. Contraintes métier recommandées

## 7.1. Unicité

- un `customer_code` doit être unique par tenant si utilisé
- une `identity_value` doit être unique par type/tenant
- un `case_number` doit être unique par tenant

## 7.2. Intégrité

- une tâche doit référencer un client
- un document doit référencer un client
- un événement doit référencer un client

## 7.3. Gouvernance

- toute transition de statut de case ou task doit produire une ligne d'historique
- tout événement important doit produire un `interaction_event`

## 7.4. Échéances

- une tâche `todo` avec `due_at < now` doit pouvoir être marquée `overdue`
- une case avec `target_resolution_at < now` et non résolue doit déclencher une alerte ou un SLA breach

---

## 8. Indexation minimale à ne pas rater

Les requêtes critiques seront:
- liste des clients d'un commercial
- clients à relancer aujourd'hui
- dossiers ouverts
- timeline client
- documents expirants
- tâches en retard

### Index minimum
- `customer(tenant_id, portfolio_owner_id, next_action_at)`
- `follow_up_task(tenant_id, owner_commercial_id, status, due_at)`
- `customer_case(tenant_id, owner_commercial_id, status, priority)`
- `interaction_event(tenant_id, customer_id, event_at)`
- `customer_document(tenant_id, status, expires_at)`
- `customer_risk_flag(tenant_id, status, severity)`

---

## 9. Stratégie de migration recommandée

Ne pas migrer brutalement.

## Phase A. Compatibilité

Créer les nouvelles tables sans casser l'existant:
- `customer`
- `customer_identity`
- `customer_case`
- `follow_up_task`
- `interaction_event`
- `customer_document`
- `customer_kyc_profile`
- `customer_risk_flag`

## Phase B. Backfill

### Backfill initial de `customer`
À partir de `contact`:
- `display_name <- contact.name`
- `primary_phone <- contact.phone`
- `status <-` mapping depuis `conversion_status` / `is_active`
- `source <- contact.source`
- `next_action_at <- contact.next_call_date`
- `last_interaction_at <- max(contact.last_message_date, contact.last_call_date)`

### Backfill de `customer_identity`
- `phone <- contact.phone`
- `whatsapp_chat <- contact.chat_id`

### Backfill de `interaction_event`
À partir de:
- `call_log`
- `whatsapp_message`
- éventuellement `audit_log` pour certaines transitions

## Phase C. Liaison aux tables existantes

Ajouter:
- `contact.customer_id`
- `call_log.customer_id`
- `whatsapp_chat.customer_id`
- `whatsapp_message.customer_id`

## Phase D. Projection et UI

Faire évoluer le front pour lire:
- `customer`
- `follow_up_task`
- `customer_case`
- `interaction_event`

et non plus seulement des contacts dérivés du chat store.

## Phase E. Rationalisation

Une fois la migration stabilisée:
- clarifier le futur de `contact`
- migrer éventuellement les champs CRM custom vers le client

---

## 10. Mapping pratique de l'existant vers le futur

## `contact` -> `customer`

- `name` -> `display_name`
- `phone` -> `primary_phone`
- `call_status` -> dérive une prochaine action ou un état de suivi
- `last_call_date` -> source de timeline
- `next_call_date` -> `next_action_at`
- `call_count` -> métrique agrégée
- `call_notes` -> importer en note initiale si utile
- `total_messages` -> métrique agrégée
- `last_message_date` -> `last_interaction_at`
- `conversion_status` -> `lifecycle_stage`
- `source` -> `source`
- `priority` -> priorité relationnelle initiale

## `call_log` -> `interaction_event`

- `call_status` + `outcome` + `notes` deviennent des événements relationnels

## `whatsapp_message` -> `interaction_event`

- message entrant/sortant alimente la timeline

## `whatsapp_chat` -> contexte interactionnel

- rattachement à `customer`
- éventuellement à `customer_case`

---

## 11. Modèle minimal à implémenter en premier

Si vous voulez avancer vite sans exploser le scope, commencez par 6 tables:

### V1 minimale
- `customer`
- `customer_identity`
- `customer_case`
- `follow_up_task`
- `interaction_event`
- `customer_note`

Avec seulement cela, vous pouvez déjà obtenir:
- vraie fiche client
- vraies relances
- vraie timeline
- vrais dossiers

Puis ajouter en V2:
- `customer_document`
- `customer_kyc_profile`
- `customer_risk_flag`
- `service_entitlement`

---

## 12. Recommandation finale

Le meilleur chemin n'est pas de remplacer tout le modèle actuel.

Le meilleur chemin est:

### 1. Conserver l'existant conversationnel
- chats
- messages
- dispatch
- queue
- FlowBot

### 2. Introduire un nouveau noyau relationnel
- `customer`
- `customer_case`
- `follow_up_task`
- `interaction_event`

### 3. Relier progressivement les anciens objets au nouveau noyau
- `contact`
- `call_log`
- `whatsapp_chat`
- `whatsapp_message`

### 4. Migrer ensuite le front
pour qu'il lise un registre client réel et non une projection de conversations.

---

## 13. Décision recommandée immédiate

Si vous me demandez la meilleure décision technique maintenant:

### Décision
Créer d'abord:
- `customer`
- `customer_identity`
- `customer_case`
- `follow_up_task`
- `interaction_event`

Puis:
- ajouter `customer_id` dans `contact`, `call_log`, `whatsapp_chat`, `whatsapp_message`

C'est le plus fort ratio:
- valeur métier
- complexité raisonnable
- risque faible sur l'existant

