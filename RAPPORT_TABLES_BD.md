# Rapport d'Analyse des Tables de Base de Données
**Date:** 2026-05-04  
**Projet:** message_whatsapp (NestJS + TypeORM + MySQL)

---

## Table des matières
1. [Tables de mapping d'identité (ERP ↔ Interne)](#1-tables-de-mapping-didentité)
2. [Tables d'appels téléphoniques](#2-tables-dappels-téléphoniques)
3. [Obligations d'appels (Call Tasks)](#3-obligations-dappels)
4. [Dossier client](#4-dossier-client)
5. [Tables pont / Assignation](#5-tables-pont--assignation)
6. [Synchronisation DB1 ↔ DB2](#6-synchronisation-db1--db2)
7. [Tables lecture seule (DB2)](#7-tables-lecture-seule-db2)
8. [Diagramme des relations](#8-diagramme-des-relations)
9. [Analyse de redondance et fusions possibles](#9-analyse-de-redondance-et-fusions-possibles)
10. [Tableau récapitulatif](#10-tableau-récapitulatif)

---

## 1. Tables de mapping d'identité

### 1.1 `commercial_identity_mapping`
**Fichier entité:** `src/integration/entities/commercial-identity-mapping.entity.ts`  
**Migration:** `src/database/migrations/20260421_integration_identity_mapping.ts`

**Objectif:** Mappe les commerciaux internes (UUID) vers leur identifiant entier (INT) dans l'ERP externe DB2.

**Colonnes:**
| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK | Identifiant interne |
| `commercial_id` | CHAR(36) | UNIQUE | UUID du commercial interne |
| `external_id` | INT | UNIQUE | ID commercial dans DB2 |
| `commercial_name` | VARCHAR(100) | nullable | Nom (dénormalisé) |
| `created_at`, `updated_at` | TIMESTAMP | | |

**Services utilisateurs:**
- `integration.service.ts` — `upsertCommercialMapping()`, `resolveCommercialExternalId()`, `findAllCommercialMappings()`, `deleteCommercialMapping()`
- `call-obligation.service.ts` — résolution de poste via ID DB2 (`resolvePosteByCommercialId()`)
- `call-log.service.ts` — stockage des commerciaux qui passent les appels

**Utilisation concrète:**  
Quand l'ERP envoie un événement avec un ID commercial (entier DB2), on le résout vers l'UUID interne. Permet la synchronisation bidirectionnelle avec l'ERP.

**Est-elle indispensable ?** ✅ **OUI** — Source de vérité pour la traduction d'ID commercial UUID ↔ INT DB2.

**Peut-elle être fusionnée ?**  
Techniquement, les champs `external_id` et `commercial_name` pourraient être ajoutés directement à la table `whatsapp_commercial`. Ce serait plus simple car il n'y aurait plus besoin de jointure. Cependant, le mapping d'identité est une préoccupation d'intégration séparée de la table commerciale — garder la séparation rend les deux domaines plus propres.

---

### 1.2 `client_identity_mapping`
**Fichier entité:** `src/integration/entities/client-identity-mapping.entity.ts`  
**Migration:** `src/database/migrations/20260421_integration_identity_mapping.ts` (même migration)

**Objectif:** Mappe les contacts internes (UUID) vers leur identifiant entier (INT) dans l'ERP DB2. Stocke aussi le numéro de téléphone normalisé pour résolution inverse.

**Colonnes:**
| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK | |
| `contact_id` | CHAR(36) | UNIQUE | UUID du contact interne |
| `external_id` | INT | UNIQUE | ID client dans DB2 |
| `phone_normalized` | VARCHAR(30) | nullable, INDEX | Téléphone sans caractères spéciaux |
| `created_at`, `updated_at` | TIMESTAMP | | |

**Services utilisateurs:**
- `integration.service.ts` — `upsertClientMapping()`, `resolveClientExternalId()`, `resolveContactIdByPhone()`, `findAllClientMappings()`, `deleteClientMapping()`
- `call-obligation.service.ts` — résolution de catégorie client via ID DB2
- `contact/business-menu.service.ts` — résolution de catégorie client
- `order-call-sync.service.ts` — traçabilité appels vs commandes

**Utilisation concrète:**  
- Résolution directe: ID client DB2 → UUID contact interne
- Résolution inverse: numéro de téléphone → contact interne (`resolveContactIdByPhone()`)
- Essentiel pour tracer les appels par catégorie de commande (annulée/livrée/jamais commandé)

**Est-elle indispensable ?** ✅ **OUI** — Source de vérité pour la traduction d'ID client UUID ↔ INT DB2 + résolution par téléphone.

**Peut-elle être fusionnée ?**  
Même raisonnement que `commercial_identity_mapping`. On pourrait ajouter `external_id` et `phone_normalized` à la table `contact`, mais cela mélange les domaines d'intégration et de contact. À garder séparée.

---

## 2. Tables d'appels téléphoniques

### 2.1 `call_log`
**Fichier entité:** `src/call-log/entities/call_log.entity.ts`  
**Migration:** `src/database/migrations/20260218_create_call_log.ts`

**Objectif:** Enregistrement structuré de tous les appels **passés par les commerciaux** via l'interface utilisateur. C'est la vue métier des appels.

**Colonnes:**
| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK | |
| `contact_id` | VARCHAR(36) | INDEX | Contact appelé |
| `commercial_id` | VARCHAR(36) | INDEX | UUID du commercial |
| `commercial_name` | VARCHAR(200) | | Nom (dénormalisé) |
| `called_at` | TIMESTAMP | INDEX | Quand l'appel s'est produit |
| `call_status` | ENUM | | `à_appeler`, `appelé`, `rappeler`, `non_joignable` |
| `outcome` | ENUM | nullable | `répondu`, `messagerie`, `pas_de_réponse`, `occupé` |
| `duration_sec` | INT | nullable | Durée en secondes |
| `notes` | TEXT | nullable | Notes du commercial |
| `treated` | TINYINT | default 0 | Si l'appel a été traité/résolu |
| `createdAt`, `updatedAt` | TIMESTAMP | | |

**Services utilisateurs:**
- `call_log.service.ts` — CRUD complet (`create`, `findByContactId`, `findByCommercialId`, `findMissedByCommercial`, `markTreated`, `update`, `remove`)
- `client-dossier.service.ts` — 50 derniers appels par contact, timeline, appels liés à une conversation
- `analytics.service.ts` — métriques sur les appels
- `ai-assistant.service.ts` — contexte appels antérieurs pour l'IA

**Utilisation concrète:**  
Chaque appel téléphonique enregistré manuellement par le commercial. Permet l'historique commercial, le suivi des appels manqués, et contribue au dossier client.

**Est-elle indispensable ?** ✅ **OUI** — Table primaire des appels commerciaux (interface UI). Distincte de `call_event`.

**Relation avec `call_event`:** Ces deux tables sont **indépendantes** :
- `call_log` = appels saisis manuellement par les commerciaux
- `call_event` = événements d'appels reçus automatiquement du système téléphonique GICOP

---

### 2.2 `call_event`
**Fichier entité:** `src/window/entities/call-event.entity.ts`  
**Migration:** créée via `src/database/migrations/20260421_phase9_sliding_window.ts`

**Objectif:** Capture brute des événements d'appels reçus du système de téléphonie GICOP (base externe). Ces données sont automatiques et non saisies manuellement.

**Colonnes:**
| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK | |
| `external_id` | VARCHAR(100) | UNIQUE | ID unique GICOP (idempotence) |
| `commercial_phone` | VARCHAR(50) | | Numéro du commercial |
| `commercial_email` | VARCHAR(200) | nullable | |
| `client_phone` | VARCHAR(50) | | Numéro du client |
| `call_status` | VARCHAR(30) | | `answered`, `no_answer`, `busy`, `rejected`, `failed`, `voicemail` |
| `duration_seconds` | INT | nullable | |
| `recording_url` | VARCHAR(500) | nullable | URL enregistrement |
| `order_id` | VARCHAR(100) | nullable | Commande associée |
| `event_at` | TIMESTAMP | | Quand l'appel s'est produit |
| `chat_id` | VARCHAR(100) | nullable | Lien conversation WhatsApp |
| `commercial_id` | CHAR(36) | nullable | UUID commercial (résolu après réception) |
| `created_at` | TIMESTAMP | | Timestamp d'ingestion |

**Services utilisateurs:**
- `call-event.service.ts` — lecture seule, liste paginée pour l'admin
- `call-obligation.service.ts` — **usage critique** : un événement GICOP peut valider une tâche d'appel si durée ≥ 90s

**Utilisation concrète:**  
Le webhook GICOP envoie l'événement → `external_id` garantit l'idempotence → si durée ≥ 90s, tente de valider une tâche d'obligation → stocke `external_id` dans `call_task.callEventId`.

**Est-elle indispensable ?** ✅ **OUI** — Capture brute du système GICOP. Point d'entrée des obligations d'appels automatiques.

---

## 3. Obligations d'appels

### 3.1 `call_task`
**Fichier entité:** `src/call-obligations/entities/call-task.entity.ts`  
**Migration:** `src/database/migrations/20260422_sprint6_call_obligations.ts`

**Objectif:** Tâche élémentaire d'appel obligatoire. Chaque commercial doit passer 5 appels dans chaque catégorie (commande annulée / commande livrée / jamais commandé) par batch.

**Colonnes:**
| Colonne | Type | Contrainte | Description |
|---------|------|------------|-------------|
| `id` | UUID | PK | |
| `batch_id` | CHAR(36) | INDEX | FK vers `CommercialObligationBatch` |
| `poste_id` | CHAR(36) | INDEX | FK vers le poste |
| `category` | ENUM | | `commande_annulee`, `commande_avec_livraison`, `jamais_commande` |
| `status` | ENUM | default: `pending` | `pending`, `done` |
| `clientPhone` | VARCHAR(50) | nullable | Téléphone appelé (rempli à validation) |
| `callEventId` | VARCHAR(100) | nullable | External ID GICOP qui a validé la tâche |
| `durationSeconds` | INT | nullable | Durée de l'appel validé |
| `completedAt` | TIMESTAMP | nullable | Quand complétée |
| `created_at` | TIMESTAMP | | |

**Index:** `IDX_call_task_batch_cat` (batch_id, category, status), `IDX_call_task_poste` (poste_id, status)

**Services utilisateurs:**
- `call-obligation.service.ts` — `getOrCreateActiveBatch()`, `tryMatchCallToTask()`, `getTasksByPoste()`, `getActiveBlockConversations()`

**Utilisation concrète:**  
Un batch génère 15 tâches (5×3 catégories). Chaque appel GICOP ≥ 90s valide une tâche de sa catégorie. Quand les 15 tâches sont DONE + contrôle qualité OK → batch COMPLETE → rotation de poste autorisée.

**Est-elle indispensable ?** ✅ **OUI** — Système central des obligations d'appels.

---

### 3.2 `commercial_obligation_batch`
**Fichier entité:** `src/call-obligations/entities/commercial-obligation-batch.entity.ts`  
**Migration:** `src/database/migrations/20260422_sprint6_call_obligations.ts` (même migration)

**Objectif:** Lot d'obligations pour un poste. Parent de `call_task`. Maintient les compteurs et valide la complétude.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `poste_id` | CHAR(36) | FK vers poste (INDEX) |
| `batch_number` | INT | Numéro séquentiel (1, 2, 3…) |
| `status` | ENUM | `pending`, `complete` |
| `annuleeDone` | INT | Tâches "commande annulée" complétées |
| `livreeDone` | INT | Tâches "commande livrée" complétées |
| `sansCommandeDone` | INT | Tâches "jamais commandé" complétées |
| `qualityCheckPassed` | BOOLEAN | Contrôle qualité (dernier msg du commercial) |
| `created_at` | TIMESTAMP | |
| `completed_at` | TIMESTAMP nullable | |

**Services utilisateurs:**
- `call-obligation.service.ts` — cycle de vie complet du batch

**Est-elle indispensable ?** ✅ **OUI** — Parent légitime de `call_task`. 1 seul batch PENDING par poste. Pas de fusion possible avec `call_task` (1:N).

---

## 4. Dossier client

### 4.1 `client_dossier`
**Fichier entité:** `src/client-dossier/entities/client-dossier.entity.ts`  
**Migrations:** `20260423_client_dossier.ts`, `20260425_client_dossier_commercial_id.ts`

**Objectif:** Dossier structuré du client — profiling commercial, besoin produit, score d'intérêt, suivi. **Une seule ligne par contact** (unique sur `contact_id`).

**Colonnes:**
| Groupe | Colonne | Type | Description |
|--------|---------|------|-------------|
| **Clé** | `id` | UUID PK | |
| **Clé** | `contact_id` | CHAR(36) UNIQUE | FK vers Contact |
| **Clé** | `commercial_id` | CHAR(36) nullable | Qui a créé/mis à jour |
| **Identification** | `full_name` | VARCHAR(200) nullable | |
| **Identification** | `ville`, `commune`, `quartier` | VARCHAR(100) nullable | |
| **Identification** | `other_phones` | TEXT nullable | Autres numéros (JSON) |
| **Intérêt** | `product_category` | VARCHAR(200) nullable | |
| **Intérêt** | `client_need` | TEXT nullable | Besoin exprimé |
| **Intérêt** | `interest_score` | TINYINT nullable | Score 0-100 |
| **Intérêt** | `is_male_not_interested` | BOOLEAN default false | Client explicitement non intéressé |
| **Suivi** | `follow_up_at` | TIMESTAMP nullable | Prochaine relance |
| **Suivi** | `next_action` | VARCHAR(50) nullable | Prochaine action |
| **Suivi** | `notes` | TEXT nullable | Notes libres |
| | `created_at`, `updated_at` | TIMESTAMP | |

**Services utilisateurs:**
- `client-dossier.service.ts` — CRUD, timeline, recherche, assignation portefeuille
- `ai-assistant.service.ts` — contexte pour l'IA
- `gicop-report.service.ts` — synchronisation vers GICOP
- `contact.service.ts` — création du dossier lors d'un nouveau contact

**Est-elle indispensable ?** ⚠️ **OUI mais améliorable** — Indispensable comme concept, mais peut être refactorisée (voir section 9).

---

### 4.2 `contact_phone`
**Fichier entité:** `src/client-dossier/entities/contact-phone.entity.ts`  
**Migration:** `src/database/migrations/20260423_contact_phone.ts`

**Objectif:** Stocker les numéros de téléphone alternatifs d'un contact (plusieurs numéros possibles).

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `contact_id` | CHAR(36) INDEX | FK vers Contact |
| `phone` | VARCHAR(50) INDEX | Numéro de téléphone |
| `label` | VARCHAR(100) nullable | Ex: "WhatsApp", "Domicile", "Bureau" |
| `is_primary` | BOOLEAN default false | Numéro principal |
| `created_at` | TIMESTAMP | |

**Services utilisateurs:**
- `client-dossier.service.ts` — `listPhones()`, `addPhone()`, `removePhone()`, `listPhonesByChatId()`
- `order-write.service.ts` — synchronisation vers DB2 mirror

**Est-elle indispensable ?** ✅ **OUI** — Bonne normalisation pour les téléphones multiples. Remplace avantageusement le champ `other_phones` (TEXT) de `client_dossier`.

---

## 5. Tables pont / Assignation

### 5.1 `contact_assignment_affinity`
**Fichier entité:** `src/dispatcher/entities/contact-assignment-affinity.entity.ts`  
**Migration:** `src/database/migrations/20260422_contact_assignment_affinity.ts`

**Objectif:** Enregistrer l'affinité entre une conversation (`chat_id`) et un poste. Permet au dispatcher de réassigner intelligemment une conversation relâchée.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `chat_id` | VARCHAR(100) | Identifiant conversation (INDEX) |
| `poste_id` | CHAR(36) | FK vers poste (INDEX) |
| `is_active` | BOOLEAN default true | Si assignation active |
| `conversation_count` | INT default 1 | Nombre de tentatives |
| `last_assigned_at` | TIMESTAMP | Dernière assignation |
| `released_at` | TIMESTAMP nullable | Quand relâchée |
| `release_reason` | VARCHAR(50) nullable | `MANUAL`, `CAPACITY`, `OFFLINE`, `TIMEOUT`, `CLOSED` |
| `created_at`, `updated_at` | TIMESTAMP | |

**Services utilisateurs:**
- `dispatcher.service.ts` — assignation intelligente
- `assign-conversation.use-case.ts` — crée/met à jour une affinité
- `reinject-conversation.use-case.ts` — réassigne quand conversation relâchée

**Est-elle indispensable ?** ✅ **OUI** — Essentielle pour l'orchestration du dispatcher.

---

### 5.2 `chat_label_assignment`
**Fichier entité:** `src/label/entities/chat-label-assignment.entity.ts`  
**Migration:** `src/database/migrations/20260416_phase3_features.ts`

**Objectif:** Table de jointure N:N entre les conversations (`chat_id`) et les labels.

**Colonnes:**
| Colonne | Type | Contrainte |
|---------|------|------------|
| `id` | UUID | PK |
| `chat_id` | VARCHAR(100) | NOT NULL, INDEX |
| `label_id` | CHAR(36) | FK vers Label, INDEX |
| `created_at` | TIMESTAMP | |

**Contrainte unique:** `UQ_cla_chat_label` (chat_id, label_id) — une conversation ne peut avoir un label qu'une fois.

**Services utilisateurs:**
- `label.service.ts` — CRUD des assignations
- `whatsapp_chat_label.service.ts` — WebSocket events pour UI temps réel

**Est-elle indispensable ?** ✅ **OUI** — Normalisation correcte pour N:N. Pas de doublons.

---

### 5.3 `closure_attempt_log`
**Fichier entité:** `src/conversation-closure/entities/closure-attempt-log.entity.ts`  
**Migration:** `src/database/migrations/20260424_sprint1_features.ts`

**Objectif:** Audit de chaque tentative de fermeture de conversation et les raisons du blocage.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `chat_id` | VARCHAR(100) INDEX | La conversation |
| `commercial_id` | CHAR(36) nullable | Qui a tenté de fermer |
| `blockers` | JSON nullable | Raisons du blocage |
| `was_blocked` | TINYINT default 1 | Si la fermeture a été bloquée |
| `created_at` | TIMESTAMP | |

**Services utilisateurs:**
- `conversation-closure.service.ts` — enregistrement des tentatives

**Est-elle indispensable ?** ✅ **OUI** — Table d'audit pour la fermeture. Indispensable pour le debug et la traçabilité.

---

### 5.4 `context_binding`
**Fichier entité:** `src/context/entities/context-binding.entity.ts`  
**Migration:** `src/database/migrations/20260415_create_context_tables.ts`

**Objectif:** Lier des contextes métier à des scopes (CHANNEL, POSTE, PROVIDER, POOL). Résolution hiérarchique par priorité.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `context_id` | CHAR(36) | FK vers Context (cascade delete) |
| `binding_type` | ENUM | `CHANNEL`, `POSTE`, `PROVIDER`, `POOL` |
| `ref_value` | VARCHAR(191) | channel_id / poste_id / provider name / "global" |
| `created_at` | TIMESTAMP | |

**Contrainte unique:** `UQ_ctx_binding_type_ref` (binding_type, ref_value)

**Services utilisateurs:**
- `context-resolver.service.ts` — résolution de contexte CHANNEL > POSTE > PROVIDER > POOL

**Est-elle indispensable ?** ✅ **OUI** — Système de scoping sophistiqué indispensable à la flexibilité du routing de contextes.

---

### 5.5 `whatsapp_broadcast_recipient`
**Fichier entité:** `src/broadcast/entities/broadcast-recipient.entity.ts`  
**Migration:** `src/database/migrations/20260416_phase4_features.ts`

**Objectif:** Table de jointure pour les broadcasts. Un enregistrement par (broadcast, téléphone destinataire). Stocke le statut de livraison.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `broadcast_id` | CHAR(36) | FK vers Broadcast |
| `phone` | VARCHAR(20) | Numéro E.164 |
| `variables` | JSON nullable | Variables personnalisées template HSM |
| `status` | ENUM | `PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `OPTED_OUT` |
| `error_message` | VARCHAR(255) nullable | |
| `provider_message_id` | VARCHAR(100) nullable | ID message Meta (wamid) |
| `sent_at` | TIMESTAMP nullable | |
| `created_at` | TIMESTAMP | |

**Contrainte unique:** `UQ_bcr_broadcast_phone` (broadcast_id, phone)

**Services utilisateurs:**
- `broadcast.service.ts` — CRUD campagnes
- `broadcast.worker.ts` — Worker BullMQ qui envoie les messages

**Est-elle indispensable ?** ✅ **OUI** — Jointure classique et nécessaire pour le suivi des envois broadcast.

---

## 6. Synchronisation DB1 ↔ DB2

### 6.1 `integration_sync_log`
**Fichier entité:** `src/integration-sync/entities/integration-sync-log.entity.ts`  
**Migration:** `src/database/migrations/20260424_integration_sync_log.ts`

**Objectif:** Enregistrer chaque tentative de synchronisation d'entité vers DB2. Permet le retry et le suivi.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID PK | |
| `entity_type` | VARCHAR(50) | `client_dossier`, `conversation_closure`, `call_validation`, `follow_up` |
| `entity_id` | VARCHAR(36) | UUID de l'entité locale |
| `target_table` | VARCHAR(100) | Table cible DB2 |
| `status` | ENUM | `pending`, `success`, `failed` |
| `attempt_count` | INT default 0 | Nombre de tentatives |
| `last_error` | TEXT nullable | Dernier message d'erreur |
| `synced_at` | TIMESTAMP nullable | Quand synchronisé avec succès |
| `created_at`, `updated_at` | TIMESTAMP | |

**Index:** `IDX_sync_log_entity` (entity_type, entity_id), `IDX_sync_log_status` (status, created_at), `IDX_sync_log_pending` (status, attempt_count)

**Services utilisateurs:**
- `integration-sync-log.service.ts` — CRUD et retry
- `order-dossier-mirror-write.service.ts` — marque synced/failed
- `order-call-sync.service.ts` — tracking appels synchronisés

**Est-elle indispensable ?** ✅ **OUI** — Essentielle pour la résilience et le retry de synchronisation.

---

### 6.2 `order_call_sync_cursor`
**Fichier entité:** `src/order-call-sync/entities/order-call-sync-cursor.entity.ts`  
**Migration:** `src/database/migrations/20260424_order_call_sync_cursor.ts`

**Objectif:** Curseur de synchronisation incrémentale des appels DB2 → DB1. Évite de rejouer tous les appels à chaque sync.

**Colonnes:**
| Colonne | Type | Description |
|---------|------|-------------|
| `scope` | VARCHAR(50) PK | Ex: `'global'` (une ligne par scope) |
| `last_call_timestamp` | DATETIME nullable | Timestamp du dernier appel traité |
| `last_call_id` | VARCHAR(36) nullable | ID dernier appel (tie-breaker) |
| `processed_count` | BIGINT default 0 | Total traité depuis le début |
| `updated_at` | TIMESTAMP | |

**Services utilisateurs:**
- `order-call-sync.service.ts` — `getOrCreateCursor()`, `syncNewCalls()`, `updateCursor()`

**Utilisation concrète:**  
Job sync toutes les X minutes → lit depuis `last_call_timestamp` → traite appels DB2 > cursor → avance le cursor. Tie-breaker sur ID en cas d'appels au même timestamp.

**Est-elle indispensable ?** ✅ **OUI** — Indispensable pour l'idempotence et la performance de la sync incrémentale.

---

### 6.3 `messaging_client_dossier_mirror`
**Fichier entité:** `src/order-write/entities/messaging-client-dossier-mirror.entity.ts`  
**Migration:** `src/database/migrations/20260425_messaging_client_dossier_mirror.ts`

**Objectif:** Miroir côté DB2 du dossier client vu par la messagerie. **Seule table écrite en DB2 par DB1.**

**Colonnes principales:**
| Groupe | Colonnes |
|--------|----------|
| **Clé** | `messaging_chat_id` (VARCHAR(100) PK) |
| **IDs DB2** | `id_client` INT, `id_commercial` INT |
| **Messaging** | `client_messaging_contact`, `client_phones` |
| **Rapport** | `client_name`, `commercial_name`, `commercial_phone`, `commercial_email`, `ville`, `commune`, `quartier`, `product_category`, `client_need`, `interest_score`, `next_action`, `follow_up_at`, `notes` |
| **Fermeture** | `conversation_result`, `closed_at` |
| **Sync** | `sync_status` (pending/synced/error), `sync_error`, `submitted_at` |
| | `updated_at` |

**Services utilisateurs:**
- `order-dossier-mirror-write.service.ts` — upsert dans DB2 via query brute

**Est-elle indispensable ?** ✅ **OUI** (intentionnellement dupliquée) — Miroir voulu pour l'intégration DB2. La règle fondamentale est : jamais écrire dans tables natives DB2, uniquement dans `messaging_*`.

---

## 7. Tables lecture seule (DB2)

Ces tables sont mappées en lecture seule depuis DB2. Aucune écriture depuis DB1.

### 7.1 `order_command` (read-only)
**Fichier entité:** `src/order-read/entities/order-command.entity.ts`

**Objectif:** Vue de la table `commandes` DB2. Permet de résoudre la catégorie d'un client (annulé/livré/jamais commandé) pour les obligations d'appels.

**Colonnes principales:** `id`, `id_client`, `id_commercial`, `id_poste`, `statut`, `etat`, `valid`, `date_livraison`, `date_annulation`, `date_livree`, `true_cancel`, `is_order_confirmed`, `is_order_prepared`

**Services utilisateurs:**
- `call-obligation.service.ts` — résolution catégorie client via commandes DB2

---

### 7.2 `order_call_log` (read-only)
**Fichier entité:** `src/order-read/entities/order-call-log.entity.ts`

**Objectif:** Vue de la table `call_logs` DB2. Enregistrements bruts d'appels depuis le système téléphonique.

**Colonnes principales:** `id`, `id_commercial`, `id_client`, `device_id`, `call_type`, `local_number`, `remote_number`, `duration`, `call_timestamp`, `received_at`

**Services utilisateurs:**
- `order-call-sync.service.ts` — lecture incrémentale pour sync (source DB2 → DB1)

---

## 8. Diagramme des relations

```
┌──────────────────────────────────────────────────────────────────┐
│ MAPPING D'IDENTITÉ (ERP ↔ Interne)                               │
├──────────────────────────────────────────────────────────────────┤
│ commercial_identity_mapping   ↔  commercial_id (UUID)            │
│                               ↔  external_id (INT DB2)           │
│                                                                   │
│ client_identity_mapping       ↔  contact_id (UUID)               │
│                               ↔  external_id (INT DB2)           │
│                               ↔  phone_normalized                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ APPELS (3 tables indépendantes avec rôles distincts)             │
├──────────────────────────────────────────────────────────────────┤
│ call_log        → Appels saisis manuellement par les commerciaux │
│ call_event      → Événements GICOP bruts (système téléphonique)  │
│ call_task       → Obligations d'appels (gamification)             │
│   .callEventId  → lien faible vers call_event.external_id        │
│ commercial_obligation_batch  → Parent de call_task (1:N)         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ DOSSIER CLIENT                                                    │
├──────────────────────────────────────────────────────────────────┤
│ client_dossier       (1:1 avec contact)                          │
│   └── contact_phone  (1:N téléphones alternatifs)                │
│                                                                   │
│ contact_assignment_affinity  → chat ↔ poste (dispatcher)        │
│ chat_label_assignment        → chat ↔ labels (N:N)              │
│ closure_attempt_log          → audit tentatives fermeture        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SYNCHRONISATION DB1 ↔ DB2                                        │
├──────────────────────────────────────────────────────────────────┤
│ integration_sync_log         → log retry des syncs               │
│ order_call_sync_cursor       → curseur incrémental appels        │
│ messaging_client_dossier_mirror → miroir dossier dans DB2        │
│                                                                   │
│ order_command        (read-only DB2) → catégories commandes      │
│ order_call_log       (read-only DB2) → appels bruts DB2          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ AUTRES                                                            │
├──────────────────────────────────────────────────────────────────┤
│ context_binding              → scoping hiérarchique contextes    │
│ whatsapp_broadcast_recipient → destinataires campagne broadcast   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. Analyse de redondance et fusions possibles

### 9.1 Fusion NON recommandée : `call_log` + `call_event`
**Verdict : GARDER SÉPARÉES**

| Critère | call_log | call_event |
|---------|----------|------------|
| Origine | Saisie manuelle commercial | Webhook automatique GICOP |
| Format | Structuré métier | Événement brut système |
| Déclencheur | Interface UI | Webhook HTTP |
| Usage principal | Historique commercial | Validation obligations |

La fusion créerait une table confuse mêlant deux domaines très différents.

---

### 9.2 Fusion RECOMMANDÉE : `client_dossier.other_phones` → `contact_phone`
**Verdict : NETTOYER**

**Situation actuelle:** `client_dossier.other_phones` est un champ TEXT (JSON sérialisé) qui duplique ce que `contact_phone` fait en table normalisée.

**Action recommandée:**
1. Migrer les données de `other_phones` vers `contact_phone`
2. Supprimer la colonne `other_phones` de `client_dossier`
3. Mettre à jour les services pour utiliser uniquement `contact_phone`

**Effort:** Faible — migration de données + modification service

---

### 9.3 Fusion POSSIBLE : `client_dossier.follow_up_at/next_action/notes` → table `follow_up`
**Verdict : OPTIONNEL**

**Situation actuelle:** Les champs `follow_up_at`, `next_action`, `notes` dans `client_dossier` sont synchronisés vers une table `follow_up` lors des mises à jour.

**Avantage de la fusion:**
- Normalisation : un seul endroit pour les relances
- Relation 1:N (historique des relances, pas juste la prochaine)
- Évite la duplication

**Inconvénient:**
- Plus de jointures pour l'affichage du dossier
- Refactorisation plus lourde

**Effort:** Moyen — migration + modifications service + frontend

---

### 9.4 Fusion POSSIBLE : `commercial_identity_mapping` → `whatsapp_commercial`
**Verdict : FAISABLE MAIS NON PRIORITAIRE**

Tel que proposé par l'utilisateur : ajouter une colonne `external_id` (INT) dans `whatsapp_commercial` au lieu d'une table séparée.

**Avantages:**
- Simplicité : plus de jointure pour résoudre UUID → ID DB2
- Moins de tables à maintenir
- Cohérence : tout sur le commercial au même endroit

**Inconvénients:**
- Mélange domaines (métier commercial + intégration ERP)
- Si la logique d'intégration change, il faut modifier la table commerciale principale
- La séparation actuelle permet de vider/recréer le mapping sans toucher aux commerciaux

**Recommandation:** Faisable si on veut simplifier, mais la séparation actuelle est une bonne pratique d'architecture.

---

### 9.5 Fusion NON recommandée : `commercial_obligation_batch` + `call_task`
**Verdict : GARDER SÉPARÉES**

Relation 1:N légitime : un batch contient 15 tâches. Les compteurs du batch (`annuleeDone`, `livreeDone`, `sansCommandeDone`) sont calculés à partir des tâches. Fusion rendrait la table monstrueuse et difficile à requêter.

---

### 9.6 Fusion NON recommandée : `client_identity_mapping` → `contact`
**Verdict : GARDER SÉPARÉE**

Le mapping est une couche d'intégration ERP, pas une donnée métier du contact. Permettre de vider/recréer le mapping indépendamment des contacts est une garantie de sécurité importante.

---

## 10. Tableau récapitulatif

| Table | Indispensable | Fusion possible | Recommandation |
|-------|:-------------:|:---------------:|---------------|
| `commercial_identity_mapping` | ✅ OUI | ⚠️ Partielle (→ `whatsapp_commercial`) | Garder — séparation propre |
| `client_identity_mapping` | ✅ OUI | ❌ Non recommandée (→ `contact`) | Garder — couche d'intégration |
| `call_log` | ✅ OUI | ❌ Non (≠ `call_event`) | Garder — appels manuels commerciaux |
| `call_event` | ✅ OUI | ❌ Non (≠ `call_log`) | Garder — événements GICOP bruts |
| `call_task` | ✅ OUI | ❌ Non (≠ `commercial_obligation_batch`) | Garder — obligations d'appels |
| `commercial_obligation_batch` | ✅ OUI | ❌ Non (≠ `call_task`) | Garder — parent du batch |
| `client_dossier` | ✅ OUI | ⚠️ Partielle | Nettoyer `other_phones` → `contact_phone` |
| `contact_phone` | ✅ OUI | ❌ Non | Garder — bonne normalisation |
| `contact_assignment_affinity` | ✅ OUI | ❌ Non | Garder — dispatcher |
| `chat_label_assignment` | ✅ OUI | ❌ Non | Garder — N:N propre |
| `closure_attempt_log` | ✅ OUI | ❌ Non | Garder — audit fermeture |
| `context_binding` | ✅ OUI | ❌ Non | Garder — scoping flexible |
| `whatsapp_broadcast_recipient` | ✅ OUI | ❌ Non | Garder — suivi broadcast |
| `integration_sync_log` | ✅ OUI | ❌ Non | Garder — retry résilience |
| `order_call_sync_cursor` | ✅ OUI | ❌ Non | Garder — idempotence |
| `messaging_client_dossier_mirror` | ✅ OUI | N/A (miroir) | Garder — règle écriture DB2 |
| `order_command` (RO DB2) | ✅ OUI | N/A (source) | Garder — catégories commandes |
| `order_call_log` (RO DB2) | ✅ OUI | N/A (source) | Garder — appels bruts DB2 |

### Priorités d'action

| Priorité | Action | Effort |
|----------|--------|--------|
| 🟠 Moyen | Nettoyer `client_dossier.other_phones` → migrer vers `contact_phone` | Faible |
| 🟡 Bas | Évaluer fusion `commercial_identity_mapping` → `whatsapp_commercial` | Moyen |
| 🟡 Bas | Évaluer extraction `follow_up_at/next_action/notes` → table `follow_up` 1:N | Moyen |
