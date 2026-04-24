# Plan d'Implementation Double Base de Donnees Messagerie / Gestion des Commandes

Date: 2026-04-24

## Objectif

Ce document definit le plan d'implementation d'une architecture a double connexion base de donnees dans la plateforme de messagerie.

Le but est:

- conserver la base actuelle de la messagerie comme base locale principale
- ajouter une seconde connexion vers la base de la plateforme de gestion des commandes
- lire directement les donnees metier utiles depuis la base commande
- ecrire dans des tables miroir dediees dans la base commande pour les donnees produites par la messagerie

Cette approche permet:

- de supprimer la dependance a des routes d'echange HTTP pour les flux principaux
- de garder une lecture directe des commandes, statuts et appels utiles
- de pousser une copie des rapports et autres donnees messagerie utiles directement dans la base de la plateforme commande

## Principe de gouvernance des donnees

Regle retenue:

- une plateforme n'ecrit jamais dans les tables metier natives dont elle n'est pas source de verite
- une plateforme peut lire les tables metier de l'autre plateforme
- si une plateforme a besoin qu'une donnee de l'autre existe dans sa base, cette donnee doit etre stockee dans une table miroir ou d'integration explicitement dediee

Application a ce projet:

- les tables natives de la plateforme commande restent en lecture seule pour la messagerie
- les tables miroir ajoutees dans la base commande mais alimentees par la messagerie deviennent des tables d'integration dont la messagerie est responsable fonctionnelle

## Tables communiquees et interpretation fonctionnelle

## 1. Table `commandes`

Role probable:

- source de verite commande
- identification des commandes annulees, livrees, en erreur, a rappeler
- base de construction des menus metier prospects / annulees / anciens clients

Utilisation recommandee par la messagerie:

- lecture seule
- ne jamais ecrire directement dedans

Usages prevus:

- lister les commandes annulees
- identifier les clientes a rappeler
- connaitre l'etat de livraison
- recuperer les commandes en erreur
- construire les listes de suivi metier

## 2. Table `statuts_commandes`

Role probable:

- historique des changements d'etat d'une commande
- utile pour comprendre le parcours commande

Utilisation recommandee par la messagerie:

- lecture seule
- exploitation pour enrichir la qualification commerciale et le contexte de conversation

Usages prevus:

- connaitre le dernier statut reel d'une commande
- justifier un menu "commande annulee"
- calculer certains signaux de relance ou de priorite

## 3. Table `whatsapp_numbers_to_call`

Role probable:

- numeros de telephone a rappeler lies a un poste

Utilisation recommandee:

- si cette table appartient deja au domaine de la plateforme commande, la messagerie doit la lire seulement
- si vous souhaitez que la messagerie l'alimente, il faut la requalifier explicitement comme table d'integration partagee ou creer une table miroir equivalente dediee

Recommandation:

- ne pas reutiliser cette table telle quelle pour des ecritures messagerie sans clarification de gouvernance
- preferer une table miroir de type `messaging_numbers_to_call_sync`

## 4. Table `call_logs`

Role probable:

- journal des appels remontes depuis un device ou une plateforme telephonique

Utilisation recommandee:

- si cette table est alimentee par la plateforme telephonique/commande, la messagerie la lit
- si la messagerie doit exploiter ces appels pour ses validations, elle les importe ou les consomme sans en devenir proprietaire

Usages prevus:

- alimenter les obligations d'appel
- identifier les appels en absence
- construire les priorites poste

## Decision d'architecture

La messagerie doit avoir:

- `DB1`: base locale messagerie
- `DB2`: base plateforme gestion des commandes

Dans le code, il faut conserver une couche applicative dediee:

- lecture base commande
- ecriture base commande vers tables miroir seulement
- suivi de synchronisation local

Il ne faut pas faire de requetes SQL de la base commande partout dans le projet.

## Strategie de lecture / ecriture

## Lecture depuis la base commande

Tables lues directement:

- `commandes`
- `statuts_commandes`
- `call_logs`
- eventuellement `whatsapp_numbers_to_call` si confirme comme source de lecture utile

Usage:

- menus metier
- contexte de conversation
- validation appels
- priorisation des taches

## Ecriture dans la base commande

La messagerie ne doit pas ecrire dans:

- `commandes`
- `statuts_commandes`
- `call_logs`

La messagerie ecrit seulement dans des tables miroir dediees, creees specialement dans la base commande.

## Tables miroir a creer dans la base commande

Je recommande de creer les tables suivantes dans la base de gestion des commandes.

## 1. `messaging_conversation_reports`

Objectif:

- stocker une copie complete du rapport commercial produit par la messagerie

Champs recommandes:

- `id`
- `messaging_report_id`
- `messaging_chat_id`
- `messaging_contact_id`
- `commercial_id`
- `commercial_name`
- `commercial_email`
- `commercial_phone`
- `client_name`
- `ville`
- `commune`
- `quartier`
- `product_category`
- `other_phones`
- `client_need`
- `interest_score`
- `is_male_not_interested`
- `follow_up_at`
- `next_action`
- `notes`
- `conversation_result`
- `report_completed_at`
- `sync_created_at`
- `sync_updated_at`
- `sync_version`

Regle:

- source fonctionnelle: messagerie
- stockage: base commande
- but: exploitation metier cote commande

## 2. `messaging_conversation_closure`

Objectif:

- stocker l'etat de fermeture metier d'une conversation

Champs recommandes:

- `id`
- `messaging_chat_id`
- `messaging_report_id`
- `closure_status`
- `closure_reason`
- `closed_by_commercial_id`
- `closed_by_commercial_email`
- `closed_at`
- `has_follow_up`
- `follow_up_at`
- `sync_created_at`
- `sync_updated_at`

## 3. `messaging_call_validation_events`

Objectif:

- stocker les appels rattaches a la logique de validation commerciale

Champs recommandes:

- `id`
- `source_call_log_id`
- `device_id`
- `call_type`
- `local_number`
- `remote_number`
- `contact_name`
- `duration`
- `call_timestamp`
- `matched_commercial_id`
- `matched_commercial_email`
- `matched_chat_id`
- `validation_category`
- `is_eligible`
- `eligibility_reason`
- `sync_created_at`
- `sync_updated_at`

## 4. `messaging_follow_up_exports`

Objectif:

- stocker les relances planifiees utiles a la plateforme commande

Champs recommandes:

- `id`
- `messaging_follow_up_id`
- `messaging_contact_id`
- `messaging_chat_id`
- `commercial_id`
- `commercial_email`
- `follow_up_type`
- `scheduled_at`
- `status`
- `notes`
- `completed_at`
- `result`
- `sync_created_at`
- `sync_updated_at`

## 5. `messaging_numbers_to_call_sync`

Objectif:

- pousser vers la base commande la liste des numeros a rappeler issue des regles messagerie si besoin

Champs recommandes:

- `id`
- `messaging_source_type`
- `messaging_source_id`
- `poste_id`
- `number`
- `category`
- `priority_level`
- `status`
- `created_at`
- `updated_at`

## Modules applicatifs a creer dans la messagerie

## 1. `order-db-read`

Responsabilite:

- centraliser toutes les lectures depuis la base commande

Services recommandes:

- `OrderCommandReadService`
- `OrderStatusReadService`
- `OrderCallLogReadService`
- `OrderProspectReadService`

## 2. `order-db-write`

Responsabilite:

- centraliser les ecritures vers les tables miroir de la base commande

Services recommandes:

- `OrderReportMirrorWriteService`
- `OrderClosureMirrorWriteService`
- `OrderCallValidationMirrorWriteService`
- `OrderFollowUpMirrorWriteService`

## 3. `order-sync`

Responsabilite:

- orchestrer quand et comment une donnee locale messagerie est synchronisee vers la base commande

Services recommandes:

- `ConversationReportSyncService`
- `ConversationClosureSyncService`
- `FollowUpSyncService`
- `CallValidationSyncService`

## 4. `order-mapping`

Responsabilite:

- gerer les correspondances entre entites messagerie et entites commande

Exemples:

- contact messagerie <-> client commande
- commercial messagerie <-> commercial commande
- conversation messagerie <-> commande ou client commande

## 5. `sync-audit`

Responsabilite:

- tracer tous les envois et echecs de synchronisation

Table locale recommande:

- `integration_sync_log`

Champs recommandes:

- `id`
- `entity_type`
- `entity_id`
- `target_db`
- `target_table`
- `operation_type`
- `status`
- `attempt_count`
- `last_error`
- `last_attempt_at`
- `synced_at`

## Flux cibles avec cette architecture

## Flux 1. Fermeture conversationnelle

### Etapes

1. la commerciale finalise son rapport dans la base messagerie
2. le moteur de fermeture valide les regles metier
3. si tout est conforme, la conversation est fermee localement
4. la copie du rapport complet est inseree ou mise a jour dans `messaging_conversation_reports`
5. l'etat de fermeture est insere ou mis a jour dans `messaging_conversation_closure`
6. un log de synchronisation est enregistre localement

### Resultat attendu

- la base messagerie reste source de verite de la fermeture
- la base commande recoit une copie exploitable

## Flux 2. Menus metier prospects / annulees / anciennes clientes

### Etapes

1. la messagerie lit `commandes`
2. elle applique ses regles de filtrage
3. elle construit des vues operateur:
   - prospects
   - commandes annulees
   - anciennes clientes

### Resultat attendu

- pas de duplication inutile
- donnees commande toujours a jour

## Flux 3. Appels et validation

### Etapes

1. la messagerie lit `call_logs`
2. elle identifie le commercial via numero local, numero distant ou mapping
3. elle rapproche le client et la conversation
4. elle met a jour ses validations locales
5. elle ecrit eventuellement une copie dans `messaging_call_validation_events`

### Resultat attendu

- la source de verite appel reste externe
- la messagerie exploite les appels sans posseder la table native

## Flux 4. Rappel automatique et suivi des relances

### Etapes

1. la messagerie gere localement les relances
2. si la plateforme commande a besoin de la relance, la messagerie l'exporte dans `messaging_follow_up_exports`
3. les changements d'etat sont mis a jour dans la table miroir

## Plan d'implementation recommande

## Phase 1. Infrastructure double connexion

Priorite: `P0`

### Taches

- ajouter une seconde connexion TypeORM ou DataSource vers la base commande
- configurer les variables d'environnement dediees
- separer clairement les entites `messagerie` et `commande`
- tester la connexion lecture
- tester la connexion ecriture sur tables miroir

### Critere de validation

- le projet peut lire la base commande sans impacter la base messagerie

## Phase 2. Couche de lecture commande

Priorite: `P0`

### Taches

- mapper les entites minimales:
  - `commandes`
  - `statuts_commandes`
  - `call_logs`
  - `whatsapp_numbers_to_call` si utile
- creer les services de lecture
- ajouter les methodes:
  - commandes annulees
  - commandes a rappeler
  - commandes en erreur
  - clientes livrees
  - anciennes clientes
- optimiser les requetes avec les indexes existants

### Critere de validation

- les menus metier peuvent etre alimentes depuis la base commande

## Phase 3. Creation des tables miroir en base commande

Priorite: `P0`

### Taches

- creer `messaging_conversation_reports`
- creer `messaging_conversation_closure`
- creer `messaging_call_validation_events`
- creer `messaging_follow_up_exports`
- creer `messaging_numbers_to_call_sync` si besoin
- ajouter indexes sur:
  - `messaging_chat_id`
  - `commercial_id`
  - `commercial_email`
  - `follow_up_at`
  - `call_timestamp`

### Critere de validation

- toutes les donnees produites par la messagerie ont un point de stockage propre dans la base commande

## Phase 4. Synchronisation rapport et fermeture

Priorite: `P0`

### Taches

- brancher la soumission du rapport vers `messaging_conversation_reports`
- brancher la fermeture vers `messaging_conversation_closure`
- gerer upsert au lieu d'insert simple
- ajouter journal de sync locale
- ajouter retry en cas d'echec

### Critere de validation

- un rapport complet et une fermeture produisent leur miroir cote commande

## Phase 5. Synchronisation appels

Priorite: `P1`

### Taches

- lire `call_logs`
- mettre en place un job d'import incremental
- memoriser le dernier curseur traite
- evaluer l'eligibilite metier
- ecrire le resultat dans `messaging_call_validation_events`

### Critere de validation

- chaque appel utile peut alimenter les obligations d'appel sans webhook

## Phase 6. Menus metier et priorisation poste

Priorite: `P1`

### Taches

- construire les vues prospects / annulees / anciennes clientes depuis `commandes`
- exploiter `call_logs` pour les appels en absence
- exploiter les conversations locales pour les messages prioritaires du poste
- afficher des compteurs et listes dediees

### Critere de validation

- les ecrans operateur fonctionnent avec des donnees mixtes locales + commande

## Phase 7. Durcissement et gouvernance

Priorite: `P1`

### Taches

- documenter qui ecrit quoi
- documenter qui lit quoi
- ajouter audits
- ajouter dashboards de sync
- tester les pannes DB2

### Critere de validation

- l'integration reste robuste meme si la base commande est temporairement indisponible

## Recommandations techniques importantes

## 1. Ne jamais ecrire dans les tables natives commande

Interdiction d'ecriture directe dans:

- `commandes`
- `statuts_commandes`
- `call_logs`

## 2. Utiliser uniquement des tables miroir dediees

Avantage:

- respecte la gouvernance
- limite les risques de corruption
- clarifie les responsabilites

## 3. Utiliser des upserts idempotents

Chaque synchronisation doit pouvoir etre rejouee sans doublon.

## 4. Utiliser un journal de synchronisation local

Indispensable pour:

- les retries
- les diagnostics
- l'audit

## 5. Faire attention a `whatsapp_numbers_to_call`

Cette table est en `MyISAM`, contrairement aux autres tables critiques en `InnoDB`.

Cela implique:

- pas de transaction fiable
- risque de verrouillage ou comportement different

Recommandation:

- ne pas en faire une table critique d'integration en ecriture
- preferer une table miroir InnoDB dediee

## Mon avis final sur ce modele

Ce plan est solide si vous appliquez cette discipline:

- lecture directe des tables metier commande
- ecriture uniquement dans des tables miroir dediees dans la base commande
- aucune ecriture de la messagerie dans les tables source de verite de la plateforme commande

C'est une bonne evolution de l'architecture precedente, car elle:

- supprime une partie des integrations HTTP
- garde une gouvernance claire
- permet de livrer vite les flux prioritaires
- reste propre du point de vue data ownership

## Prochaines actions recommandees

1. valider officiellement la liste des tables commande en lecture seule
2. valider officiellement la liste des tables miroir a creer
3. definir les mappings commerciaux / clients / conversations
4. implementer la seconde connexion DB dans le projet
5. brancher d'abord:
   - fermeture conversationnelle
   - export rapport
   - lecture commandes annulees / prospects
   - import appels
