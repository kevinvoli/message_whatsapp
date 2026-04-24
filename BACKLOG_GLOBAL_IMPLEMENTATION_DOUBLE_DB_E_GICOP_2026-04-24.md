# Backlog Global d'Implementation Double DB E-GICOP

Date: 2026-04-24

## Objectif

Ce backlog consolide les deux plans suivants:

- plan d'implementation prioritaire messagerie E-GICOP
- plan d'implementation double base de donnees messagerie / gestion des commandes

Il integre egalement:

- les suppressions de code obsolete
- les refactors necessaires
- les nouvelles briques techniques a construire

## Perimetre

Le backlog couvre:

- fermeture conversationnelle
- rappels automatiques de relance
- menus metier dedies
- priorisation appels en absence / messages poste
- lecture directe des donnees de la base commande
- ecriture des copies miroir en base commande
- refactor de l'integration existante
- suppression du code mort ou obsolete

## Priorites

- `P0`: indispensable pour la bascule cible
- `P1`: necessaire juste apres le socle
- `P2`: durcissement, supervision, nettoyage secondaire

## Epic 1. Infrastructure double base de donnees

Priorite: `P0`

### Objectif

Ajouter une seconde connexion vers la base commande et preparer les couches de lecture/ecriture.

### User story 1.1

En tant que systeme, je veux disposer de deux connexions DB separees pour lire la base commande sans impacter la base messagerie.

#### Taches backend

- ajouter une seconde `DataSource` TypeORM
- ajouter les variables d'environnement DB2
- separer les repositories `messagerie` et `commande`
- verifier les connexions au demarrage
- ajouter un healthcheck minimal DB2

#### Criteres d'acceptation

- la base messagerie et la base commande sont accessibles separement
- les erreurs DB2 sont detectees proprement

### User story 1.2

En tant qu'architecte, je veux une couche d'acces distincte pour la base commande afin d'eviter les requetes SQL dispersees.

#### Taches backend

- creer module `order-db-read`
- creer module `order-db-write`
- creer module `order-sync`
- creer module `order-mapping`

#### Criteres d'acceptation

- aucun module metier ne tape directement la base commande hors couche dediee

## Epic 2. Lecture directe des donnees commande

Priorite: `P0`

### Objectif

Lire directement les donnees utiles depuis la base commande.

### User story 2.1

En tant que commerciale, je veux que les menus metier utilisent les vraies donnees de commandes.

#### Taches backend

- mapper l'entite `commandes`
- mapper l'entite `statuts_commandes`
- mapper l'entite `call_logs`
- mapper `whatsapp_numbers_to_call` uniquement si confirme utile
- creer:
  - `OrderCommandReadService`
  - `OrderStatusReadService`
  - `OrderCallLogReadService`

#### Criteres d'acceptation

- les commandes annulees sont recuperables en lecture
- les commandes livrees sont recuperables en lecture
- les commandes en erreur sont recuperables en lecture
- les appels sont recuperables en lecture

### User story 2.2

En tant que systeme, je veux construire des vues de lecture metier a partir des tables commande.

#### Taches backend

- creer une methode `getCancelledOrdersCandidates`
- creer une methode `getProspectsCandidates`
- creer une methode `getDormantCustomersCandidates`
- creer une methode `getCallsByPosteOrCommercial`
- exploiter les indexes existants

#### Criteres d'acceptation

- les listes metier prioritaires sont alimentables sans webhook ERP

## Epic 3. Tables miroir en base commande

Priorite: `P0`

### Objectif

Creer des tables dediees dans la base commande pour recevoir les donnees produites par la messagerie.

Principe retenu:

- la table miroir principale doit representer le dossier complet du client cote messagerie
- elle ne doit pas etre un simple log de rapport
- elle doit contenir les informations du rapport, de la commerciale, du client et du contexte metier utile a la plateforme commande

### User story 3.1

En tant qu'architecte, je veux stocker le dossier complet du client dans une table miroir principale dediee.

#### Taches base de donnees

- creer `messaging_client_dossier_mirror`
- ajouter indexes sur:
  - `messaging_chat_id`
  - `messaging_contact_id`
  - `commercial_id`
  - `commercial_email`
  - `client_phone`
  - `submitted_at`

#### Taches backend

- creer l'entite DB2 associee
- creer le repository DB2 associe

#### Criteres d'acceptation

- un dossier client complet peut etre insere ou mis a jour dans la base commande sans toucher aux tables metier natives

#### Donnees minimales a porter dans la table miroir principale

- identifiants techniques:
  - `messaging_chat_id`
  - `messaging_contact_id`
  - `messaging_report_id`
  - `messaging_poste_id`
- identite commerciale:
  - `commercial_id`
  - `commercial_name`
  - `commercial_email`
  - `commercial_phone`
- donnees client:
  - `client_name`
  - `client_phone`
  - `other_phones`
  - `ville`
  - `commune`
  - `quartier`
  - `product_category`
  - `client_need`
  - `interest_score`
  - `is_male_not_interested`
  - `notes`
- donnees metier:
  - `conversation_result`
  - `next_action`
  - `follow_up_at`
  - `report_completed_at`
  - `submitted_at`
  - `closure_status`
  - `closed_at`
- donnees client/commande utiles si disponibles:
  - `order_client_id`
  - `client_category`
  - `certification_status`
  - `certified_at`
- donnees de synchronisation:
  - `sync_status`
  - `sync_version`
  - `sync_created_at`
  - `sync_updated_at`
  - `last_sync_error`

### User story 3.2

En tant que systeme, je veux stocker les informations de fermeture dans une table miroir.

#### Taches base de donnees

- creer `messaging_conversation_closure`

#### Taches backend

- creer le writer de cloture

#### Criteres d'acceptation

- une fermeture valide peut etre miroirisee en base commande

#### Note d'architecture

La table specialisee de fermeture peut rester si vous souhaitez une trace dediee.
Mais la table principale exploitable cote commande reste `messaging_client_dossier_mirror`.

### User story 3.3

En tant que systeme, je veux stocker les appels exploites pour la validation dans une table miroir.

#### Taches base de donnees

- creer `messaging_call_validation_events`

#### Taches backend

- creer le writer des validations d'appel

#### Criteres d'acceptation

- chaque appel eligible peut etre historise cote commande sans ecrire dans `call_logs`

### User story 3.4

En tant que systeme, je veux stocker les relances exportees dans une table miroir.

#### Taches base de donnees

- creer `messaging_follow_up_exports`

#### Taches backend

- creer le writer des relances

#### Criteres d'acceptation

- les relances utiles a la plateforme commande sont exportables

## Epic 4. Fermeture conversationnelle guidee

Priorite: `P0`

### Objectif

Rendre la fermeture conversationnelle metier, guidee et bloquante tant que les conditions ne sont pas remplies.

### User story 4.1

En tant que commerciale, je veux un workflow unique de cloture qui m'indique ce qui manque.

#### Taches backend

- creer `ConversationClosureService`
- ajouter `validateClosure(chatId, commercialId)`
- ajouter `closeConversation(chatId, commercialId, payload)`
- produire une liste de blocages normalises
- journaliser les tentatives bloquees

#### Taches frontend

- creer une modal unique de fermeture
- afficher les blocages
- afficher les champs manquants
- empecher la validation finale si blocage

#### Criteres d'acceptation

- impossible de fermer une conversation incomplete
- les raisons de blocage sont visibles

### User story 4.2

En tant que systeme, je veux qu'une fermeture valide alimente la base commande via table miroir.

#### Taches backend

- apres cloture locale, ecrire dans `messaging_conversation_closure`
- ecrire ou mettre a jour le dossier complet dans `messaging_client_dossier_mirror`
- journaliser la synchro locale

#### Criteres d'acceptation

- une fermeture valide produit une trace locale et une copie DB2

## Epic 5. Rapport conversationnel et soumission DB-to-DB

Priorite: `P0`

### Objectif

Remplacer la soumission HTTP du rapport par une ecriture DB miroir.

### User story 5.1

En tant que systeme, je veux soumettre le rapport complet vers la base commande sans passer par API HTTP.

#### Taches backend

- refactorer `ReportSubmissionService`
- remplacer `OrderPlatformSyncService` par un service DB2 writer
- supprimer l'appel `axios.post`
- recuperer:
  - nom commerciale
  - numero commerciale
  - email commerciale
- faire un upsert dans `messaging_client_dossier_mirror`
- maintenir `submissionStatus`, `submittedAt`, `submissionError`

#### Taches frontend

- garder le bouton `submit` si necessaire
- afficher le statut de synchro

#### Criteres d'acceptation

- le rapport est bien copie en DB2
- l'etat de soumission est traçable

### User story 5.2

En tant qu'admin, je veux relancer les soumissions ratees.

#### Taches backend

- conserver le retry automatique
- refactorer le retry pour DB2 au lieu de HTTP
- exposer les rapports en echec

#### Taches frontend

- conserver la supervision
- adapter la vue aux erreurs DB2 plutot qu'HTTP

#### Criteres d'acceptation

- une erreur de synchro DB2 peut etre rejouee

## Epic 6. Appels et validations metier

Priorite: `P0`

### Objectif

Utiliser `call_logs` comme source de verite d'appel pour alimenter les regles de validation.

### User story 6.1

En tant que systeme, je veux importer les appels depuis `call_logs` au lieu de dependre d'un webhook.

#### Taches backend

- creer un job de lecture incrementale `call_logs`
- memoriser un curseur de lecture
- mapper le commercial via numero puis email si disponible ailleurs
- rattacher le client
- rattacher la conversation si possible

#### Criteres d'acceptation

- les appels nouveaux sont detectes sans doublon

### User story 6.2

En tant que manager, je veux que les appels eligibles alimentent les obligations d'appel.

#### Taches backend

- injecter les appels dans `CallObligationService`
- produire une categorie:
  - annulee
  - livree
  - sans commande
- appliquer le seuil de 90 secondes
- ecrire une trace dans `messaging_call_validation_events`

#### Taches frontend

- garder la progression d'obligation visible
- ajouter si besoin une vue de details des appels pris en compte

#### Criteres d'acceptation

- un appel eligible met a jour la progression
- un appel non eligible est journalise avec raison

## Epic 7. Rappel automatique de relance

Priorite: `P1`

### Objectif

Executer automatiquement les rappels a echeance.

### User story 7.1

En tant que commerciale, je veux recevoir un rappel automatique lorsqu'une relance arrive a echeance.

#### Taches backend

- ajouter `FollowUpReminderJob`
- identifier les relances a echeance
- eviter les doubles notifications
- creer une notification locale
- exporter la relance si necessaire dans `messaging_follow_up_exports`

#### Taches frontend

- afficher les relances dues
- ajouter badge et acces direct

#### Criteres d'acceptation

- les relances a echeance sont visibles et tracées

## Epic 8. Menus metier dedies

Priorite: `P1`

### Objectif

Construire les ecrans operateurs a partir des donnees commande lues directement.

### User story 8.1

En tant que commerciale, je veux un menu "Prospects a relancer".

#### Taches backend

- endpoint ou service de lecture prospects

#### Taches frontend

- vue prospects
- actions rapides:
  - ouvrir conversation
  - ouvrir dossier
  - planifier relance
  - appeler

#### Criteres d'acceptation

- seules les clientes cibles apparaissent

### User story 8.2

En tant que commerciale, je veux un menu "Commandes annulees".

#### Taches backend

- endpoint ou service de lecture annulees

#### Taches frontend

- vue annulees

#### Criteres d'acceptation

- seules les annulations pertinentes apparaissent

### User story 8.3

En tant que commerciale, je veux un menu "Anciennes clientes".

#### Taches backend

- regle > 60 jours
- service de lecture correspondant

#### Taches frontend

- vue anciennes clientes

#### Criteres d'acceptation

- la regle metier est respectee

## Epic 9. Priorisation appels en absence / messages poste

Priorite: `P1`

### Objectif

Imposer l'ordre de traitement metier sur le poste.

### User story 9.1

En tant que commerciale, je veux voir les appels en absence du poste avant d'autres actions.

#### Taches backend

- lire les appels manques depuis `call_logs` si la qualification le permet
- creer une couche `PostePriorityService`
- marquer traite / non traite

#### Taches frontend

- bloc prioritaire appels en absence
- compteur

#### Criteres d'acceptation

- les appels prioritaires sont visibles immediatement

### User story 9.2

En tant que commerciale, je veux voir les messages du poste non replies avant de poursuivre le reste.

#### Taches backend

- identifier les conversations prioritaires via unread + dernier message client

#### Taches frontend

- bloc prioritaire messages poste

#### Criteres d'acceptation

- les conversations prioritaires du poste sont visibles

## Epic 10. Journal de synchronisation et audit

Priorite: `P1`

### Objectif

Tracer toutes les ecritures et erreurs entre les deux bases.

### User story 10.1

En tant que systeme, je veux journaliser toutes les synchronisations DB2.

#### Taches backend

- creer table locale `integration_sync_log`
- creer `IntegrationSyncLogService`
- tracer:
  - dossier client complet
  - fermeture
  - appel
  - relance

#### Criteres d'acceptation

- toute ecriture DB2 a une trace locale

### User story 10.2

En tant qu'admin, je veux voir les synchros en echec.

#### Taches frontend

- vue admin de supervision DB2

#### Criteres d'acceptation

- les erreurs sont visibles et relancables

## Epic 11. Refactor des integrations existantes

Priorite: `P0`

### Objectif

Remplacer les anciennes integrations HTTP/webhook par le nouveau modele DB-to-DB.

### User story 11.1

En tant qu'architecte, je veux supprimer les webhooks entrants ERP/GICOP devenus inutiles.

#### Taches backend

- retirer `InboundIntegrationModule`
- retirer `InboundIntegrationService`
- retirer `GicopWebhookModule` si DB-only confirme
- retirer `GicopWebhookController`
- retirer `GicopWebhookService`

#### Criteres d'acceptation

- plus aucun flux critique ne depend de ces modules

### User story 11.2

En tant qu'architecte, je veux supprimer la logique HTTP sortante ERP.

#### Taches backend

- retirer `dispatchToErp`
- retirer les methodes `dispatch*` de `IntegrationService`
- retirer `IntegrationListener` si devenu inutile

#### Criteres d'acceptation

- l'integration ERP ne passe plus par HTTP

### User story 11.3

En tant que systeme, je veux conserver uniquement la partie mapping utile.

#### Taches backend

- garder `ClientIdentityMapping`
- garder `CommercialIdentityMapping`
- renommer/refactorer `IntegrationModule` en module de mapping inter-DB

#### Criteres d'acceptation

- les mappings continuent de fonctionner sans le reste de l'ancien module

## Epic 12. Nettoyage admin et front

Priorite: `P1`

### Objectif

Mettre l'interface admin en cohérence avec la nouvelle architecture.

### User story 12.1

En tant qu'admin, je veux une vue d'integration qui parle de DB-to-DB et non plus de webhook ERP.

#### Taches frontend

- refactorer `IntegrationView`
- retirer les references a:
  - `POST /webhooks/gicop`
  - `GET /webhooks/gicop`
  - `x-integration-secret`
- renommer la vue vers `Integration DB` ou `Mappings`

#### Criteres d'acceptation

- la documentation affichée correspond a la nouvelle architecture

### User story 12.2

En tant qu'admin, je veux une supervision GICOP adaptee a la synchro DB2.

#### Taches frontend

- refactorer `GicopSupervisionView`
- remplacer le bloc endpoint appel par un bloc statut lecture `call_logs`
- afficher les erreurs de synchro DB2

#### Criteres d'acceptation

- la vue ne mentionne plus les anciens webhooks devenus obsoletes

### User story 12.3

En tant qu'admin, je veux nettoyer la navigation obsolete.

#### Taches frontend

- mettre a jour `admin-data.ts`
- reevaluer `Webhooks sortants`
- renommer `Integration ERP`

#### Criteres d'acceptation

- la navigation admin est cohérente avec le nouveau modèle

## Epic 13. Suppression du code mort et redondant

Priorite: `P2`

### Objectif

Nettoyer le projet apres migration.

### User story 13.1

En tant qu'equipe technique, je veux supprimer le code devenu mort apres bascule.

#### Taches backend

- supprimer `inbound-integration/*`
- supprimer `gicop-webhook/*`
- supprimer l'ancien writer HTTP de rapport
- supprimer les settings obsoletes:
  - `INTEGRATION_ERP_URL`
  - `INTEGRATION_SECRET`
  - `GICOP_WEBHOOK_VERIFY_TOKEN`
  - `ORDER_PLATFORM_REPORT_URL`

#### Taches frontend/admin

- supprimer references UI aux endpoints webhook

#### Criteres d'acceptation

- le projet compile sans references a l'ancienne architecture

### User story 13.2

En tant qu'equipe technique, je veux auditer les candidats a suppression secondaire.

#### Taches

- auditer `auto-login` et `auto_connexion`
- auditer `IpAccessView` alias
- auditer les champs legacy de `ConversationReport`
- auditer `outbound-webhook` hors scope GICOP

#### Criteres d'acceptation

- chaque candidat est classe:
  - a supprimer
  - a conserver
  - a refactorer

## Plan de livraison recommande

## Sprint 1

- Epic 1 complet
- Epic 2 partiel
- Epic 3 partiel
- Epic 4 base
- Epic 5 base

## Sprint 2

- Epic 4 complet
- Epic 5 complet
- Epic 6 complet
- Epic 10 base

## Sprint 3

- Epic 7
- Epic 8
- Epic 9
- Epic 12

## Sprint 4

- Epic 11
- Epic 13
- durcissement
- tests
- nettoyage final

## Definition of Done globale

- aucun flux prioritaire ne depend encore d'un webhook ERP si DB-only confirme
- la table miroir principale `messaging_client_dossier_mirror` est fonctionnelle
- la fermeture conversationnelle est bloquante et guidee
- les appels de `call_logs` alimentent les validations
- les dossiers clients complets sont copies dans la base commande
- les erreurs de synchro sont journalisees
- le code obsolete critique est supprime
