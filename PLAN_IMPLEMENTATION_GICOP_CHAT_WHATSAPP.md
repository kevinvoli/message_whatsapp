# Plan d'implementation detaille - Chat WhatsApp Messenger GICOP

Date: 22 avril 2026

Perimetre:
- backend `message_whatsapp`
- front commercial `front`
- panel admin `admin`

Objectif:
- analyser le besoin cible GICOP
- l'aligner avec le code existant
- produire un plan d'implementation complet, detaille et exploitable

---

## 1. Contexte et constat initial

Les logs de deploiement du **21 avril 2026 a 23:46** montrent que la version deployee a bien passe les migrations, puis a echoue au demarrage du backend avec une `CircularDependencyException` dans `RedisModule`.

Conclusion immediate:
- la branche actuelle n'est pas assez stable pour empiler directement les nouvelles regles metier GICOP
- il faut d'abord traiter le probleme de composition Nest autour de Redis avant toute mise en production du chantier fonctionnel

Ce point ne remet pas en cause le plan metier, mais il conditionne l'ordre de livraison.

---

## 2. Analyse du code existant

Le socle necessaire a GICOP existe deja en grande partie.

### 2.1. Briques deja presentes

#### Affectation, queue, reinjection
Fichiers concernes:
- `message_whatsapp/src/dispatcher/application/assign-conversation.use-case.ts`
- `message_whatsapp/src/dispatcher/services/queue.service.ts`
- `message_whatsapp/src/dispatcher/dispatcher.service.ts`

Capacites existantes:
- assignation d'une conversation entrante
- logique de file d'attente
- reinjection et reassignment
- publication temps reel

#### Capacite conversationnelle
Fichier concerne:
- `message_whatsapp/src/conversation-capacity/conversation-capacity.service.ts`

Capacites existantes:
- quota actif par poste
- valeur par defaut a 10 conversations actives
- mode fenetre glissante / conversations verrouillees

#### Qualification de fin de conversation
Fichiers concernes:
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`
- `front/src/components/chat/ConversationOutcomeModal.tsx`

Capacites existantes:
- champ `conversation_result`
- enregistrement du resultat metier
- modal front de qualification

#### Relances
Fichiers concernes:
- `message_whatsapp/src/follow-up/follow_up.service.ts`
- `message_whatsapp/src/follow-up/follow_up.module.ts`
- `front/src/components/chat/CreateFollowUpModal.tsx`
- `front/src/lib/followUpApi.ts`

Capacites existantes:
- creation de relance
- completion / annulation
- relances du jour
- cron de passage en retard

#### Dossier client
Fichiers concernes:
- `message_whatsapp/src/client-dossier/client-dossier.service.ts`
- `message_whatsapp/src/contact/entities/contact.entity.ts`

Capacites existantes:
- agregat client
- timeline appels / relances / conversations
- portefeuille client partiel
- categories client
- enrichissement relationnel

#### Journalisation des appels
Fichier concerne:
- `message_whatsapp/src/call-log/call_log.service.ts`

Capacites existantes:
- creation et mise a jour de logs d'appel
- recherche par contact et commercial

#### Reponses rapides et contenus categories
Fichiers concernes:
- `message_whatsapp/src/canned-response/canned-response.service.ts`
- `front/src/components/chat/CannedResponseMenu.tsx`

Capacites existantes:
- bibliotheque de reponses rapides texte
- suggestion contextuelle
- filtrage par tenant / poste

#### Integration ERP entrante
Fichier concerne:
- `message_whatsapp/src/inbound-integration/inbound-integration.service.ts`

Capacites existantes:
- reception d'evenements de commande
- mise a jour de categorie client
- mise a jour certification et parrainage

---

## 3. Ecarts entre le besoin GICOP et l'existant

Les besoins GICOP ne sont pas couverts completement.

### 3.1. Couverture partielle seulement

#### 1. Retour toujours sur le poste affecte
Etat actuel:
- l'affectation existe
- la reaffectation existe
- mais la persistance metier du "poste proprietaire historique" n'est pas garantie de bout en bout

#### 2. Rapport obligatoire pour message entrant
Etat actuel:
- pas de formulaire structure obligatoire lie a chaque conversation
- certaines informations vivent dans `Contact`, mais pas sous forme de rapport de qualification conversationnelle

#### 3. Limite de 10 conversations simultanees
Etat actuel:
- quota actif deja present
- mais la regle n'est pas encore industrialisee sur tous les chemins metier

#### 4. Tous les 10 dossiers termines => lot d'appels cible + controle qualite
Etat actuel:
- non implemente
- aucune mecanique de batch d'obligations d'appels

#### 5. Notation client de fin de conversation
Etat actuel:
- non implemente

#### 6. Message automatique apres enregistrement de relance
Etat actuel:
- la relance existe
- l'envoi automatique a date n'existe pas

#### 7. Recapitulatif commande + photo si fenetre 24h ouverte
Etat actuel:
- integration commande partielle
- pas de scenario automatique d'envoi de recap + photo

#### 8. Envoi automatique du code d'expedition
Etat actuel:
- non implemente

#### 9. Bouton categorie d'information multimediatique
Etat actuel:
- base existante via canned responses
- mais pas de vrai catalogue metier multimedia GICOP

---

## 4. Priorite absolue avant le fonctionnel: stabilisation technique

### 4.1. Probleme a traiter

Le backend echoue au demarrage a cause d'une dependance circulaire detectee autour de `RedisModule`.

### 4.2. Objectif de cette phase

Rendre la branche a nouveau deployable avant d'ajouter les regles GICOP.

### 4.3. Travaux a mener

#### Verification de l'assemblage Nest
Verifier les modules suivants:
- `message_whatsapp/src/app.module.ts`
- `message_whatsapp/src/redis/redis.module.ts`
- `message_whatsapp/src/context/context.module.ts`
- `message_whatsapp/src/whapi/whapi.module.ts`
- `message_whatsapp/src/rbac/rbac.module.ts`
- `message_whatsapp/src/system-health/system-health.module.ts`

#### Verification des consommateurs Redis
Verifier les injections:
- `REDIS_CLIENT`
- `DistributedLockService`

Fichiers cibles:
- `message_whatsapp/src/redis/distributed-lock.service.ts`
- `message_whatsapp/src/webhooks/inbound-message.service.ts`
- `message_whatsapp/src/context/services/context-resolver.service.ts`
- `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`
- `message_whatsapp/src/system-health/system-health.controller.ts`
- `message_whatsapp/src/rbac/rbac.service.ts`

#### Livrables attendus
- backend Nest demarre sans erreur
- `npm run build` passe
- `tsc --noEmit` passe
- smoke test Docker sans rollback automatique

### 4.4. Regle de gouvernance

Tant que cette phase n'est pas validee, aucun lot metier GICOP ne doit partir en production.

---

## 5. Plan d'implementation detaille par fonctionnalite

## 5.1. Affectation persistante au meme poste

### Objectif

Des la premiere affectation utile d'une conversation, tout retour futur du meme client doit revenir au meme poste, sauf exception metier explicite.

### Probleme actuel

Aujourd'hui:
- `poste_id` represente l'affectation courante
- cette valeur peut changer avec reinjection, transfert, reassignment
- il n'existe pas de notion metier robuste de proprietaire historique

### Proposition technique

#### Option recommandee
Introduire une affinite client -> poste persistante.

Deux options possibles:

##### Option A - simple
Ajouter dans `WhatsappChat`:
- `sticky_poste_id`
- `sticky_assigned_at`
- `sticky_reason`

##### Option B - plus robuste, recommandee
Ajouter une table dediee du type:
- `contact_assignment_affinity`

Champs suggeres:
- `id`
- `contact_id`
- `poste_id`
- `assigned_at`
- `released_at`
- `source`
- `is_active`
- `tenant_id`

### Regles metier

- a la premiere affectation, memoriser le poste de reference
- a tout message entrant futur du meme client, tenter d'abord ce poste
- si le poste est indisponible:
  - soit garder en attente jusqu'au retour du poste
  - soit fallback sur un autre poste selon regle admin
- un transfert manuel peut:
  - casser l'affinite
  - ou seulement modifier l'affectation courante sans casser l'affinite

### Regles a faire valider metier

- si le poste historique est offline, faut-il attendre son retour ou redistribuer ?
- si le canal est dedie a un autre poste, la regle sticky reste-t-elle prioritaire ?
- un transfert volontaire remplace-t-il le poste historique ?

### Travaux backend

- etendre le modele de donnees
- adapter:
  - `assign-conversation.use-case.ts`
  - `dispatch-policy.service.ts`
  - `dispatch-query.service.ts`
- rechercher le poste sticky avant tout fallback queue
- tracer les decisions d'assignation

### Travaux front

- afficher le poste proprietaire de reference
- afficher un motif si la conversation n'est pas revenue sur le poste attendu

### Travaux admin

- permettre l'override manuel
- afficher l'historique d'affectation

### Tests

- meme client, nouveau message, poste historique online -> reaffectation identique
- poste historique offline -> comportement conforme a la regle choisie
- transfert manuel -> respect de la regle metier

---

## 5.2. Limite stricte a 10 conversations simultanees

### Objectif

Un commercial ne doit pas parler a plus de 10 personnes simultanement.

### Existant

Le service `ConversationCapacityService` contient deja:
- `DEFAULT_QUOTA_ACTIVE = 10`
- gestion du quota actif
- gestion du mode fenetre glissante

### Ecarts restants

Il faut garantir cette contrainte sur tous les chemins:
- assignation initiale
- reinjection
- transfert
- reouverture
- affichage front
- controle admin

### Regle cible

Definition recommandee:
- maximum 10 conversations actives avec droit de reponse simultane
- toute conversation supplementaire doit etre verrouillee, en attente, ou non prise en charge

### Travaux backend

- consolider `ConversationCapacityService`
- auditer tous les points d'entree du changement d'etat
- verifier l'appel a `onConversationAssigned` sur:
  - nouvelle affectation
  - reassignment
  - reinjection
- ajouter tests de non-depassement

### Travaux front

- afficher un indicateur visible:
  - `7/10`
  - `10/10`
- afficher les conversations verrouillees
- empecher une prise en charge non autorisee

### Travaux admin

- rendre le quota configurable
- afficher surcharge et verrouillages

### Tests

- assigner 11 conversations
- verifier que la 11e ne devient pas active
- cloturer une conversation puis verifier liberation de capacite

---

## 5.3. Rapport obligatoire sur message entrant

### Objectif

Pour toute conversation entrante, un rapport structure de qualification doit etre renseigne.

### Champs demandes par GICOP

- nom et/ou prenoms de la cliente
- ville
- commune
- quartier
- categorie de produit interesse
- type de teint ou forme
- autres numeros de telephone
- date et heure de relance
- besoin / recherche de la cliente
- note d'interet sur 5
- est-ce un homme non interesse

### Choix d'architecture

Ne pas stocker cela uniquement dans `Contact`.

Il faut une entite dediee car:
- ces donnees sont liees a une conversation
- elles evoluent au fil du traitement
- elles doivent etre auditables

### Entite recommandee

Nom propose:
- `ConversationReport`

Champs suggeres:
- `id`
- `conversation_id`
- `contact_id`
- `commercial_id`
- `client_full_name`
- `city`
- `commune`
- `district`
- `product_interest_category`
- `product_interest_detail`
- `other_phone_numbers` JSON
- `follow_up_due_at`
- `customer_need`
- `interest_score`
- `is_uninterested_male`
- `is_complete`
- `captured_at`
- `updated_at`

### Regle metier recommandee

Version pragmatique:
- le rapport doit etre commence des la prise en charge
- la conversation ne peut pas etre cloturee ni transferee si le minimum requis n'est pas rempli

### Travaux backend

Creer un module:
- `conversation-report`

API cible:
- `GET /chats/:id/report`
- `PUT /chats/:id/report`
- `PATCH /chats/:id/report/validate`

Validations:
- `interest_score` entre 1 et 5
- `follow_up_due_at` obligatoire si issue = relance
- format des numeros secondaires

### Travaux front

Ajouter un panneau rapport dans l'ecran chat:
- visible en permanence
- edition progressive
- autosave
- badge "rapport incomplet"

### Travaux admin

- vue des rapports
- taux de completude par commercial
- export CSV ou Excel

### Tests

- ouverture d'une conversation sans rapport
- tentative de cloture -> blocage
- rapport complet -> cloture autorisee

---

## 5.4. Qualification de fin de conversation renforcee

### Objectif

Toute conversation doit se terminer avec un resultat metier exploitable.

### Existant

Le systeme couvre deja une partie du besoin avec:
- `conversation_result`
- service `setConversationResult`
- modal front de qualification

### Travaux restants

#### Rendre la qualification obligatoire
- impossible de fermer une conversation sans resultat

#### Ajouter des regles conditionnelles
- `a_relancer` -> relance obligatoire
- `rappel_programme` -> date de rappel obligatoire
- `commande_confirmee` -> scenario de recap commande
- `pas_interesse` + homme non interesse -> marquage specifique

#### Historiser les changements
- ajouter une table d'historique si necessaire

### Travaux backend

- durcir `WhatsappChatService.setConversationResult`
- ajouter controles de coherence
- emettre les evenements adequats

### Travaux front

- empecher fermeture directe sans qualification
- lier la qualification au rapport de conversation

### Travaux admin

- statistiques par resultat
- filtrage par resultat et completude

---

## 5.5. Notation client de fin de conversation

### Objectif

A la fin de chaque conversation, un systeme de notation doit etre envoye au client pour evaluer le commercial et sa prestation.

### Modele recommande

Creer un module:
- `conversation-rating`

### Entite recommandee

`ConversationRating`

Champs:
- `id`
- `chat_id`
- `contact_id`
- `commercial_id`
- `rating`
- `comment`
- `sent_at`
- `received_at`
- `status`

### Flux cible

- conversation terminee
- envoi automatique d'un message de satisfaction
- reception d'une note 1 a 5
- stockage de la reponse

### Travaux backend

- listener apres qualification finale / fermeture
- envoi du message via les services outbound existants
- endpoint webhook de reception si necessaire

### Travaux front

- affichage des notes recues sur la fiche client
- affichage moyenne par commercial

### Travaux admin

- dashboard satisfaction
- classement commercial incluant la note

### Points a cadrer

- note simple sur 5 ou note + commentaire
- envoi libre ou template WhatsApp

---

## 5.6. Mecanique "chaque 10 conversations terminees => obligations d'appels"

### Objectif

Tous les 10 dossiers termines, chaque commercial doit appeler:
- 5 clientes avec commandes annulees
- 5 clientes ayant deja recu des commandes GICOP
- 5 clientes venues mais n'ayant pas passe de GICOP

Chaque appel doit durer plus de 1 minute 30 secondes.

### Etat actuel

Cette logique n'existe pas dans le code.

### Preconditions data

Les categories suivantes doivent etre calculables:
- cliente commande annulee
- cliente livree
- cliente venue sans commande

Le code existant couvre deja partiellement:
- `client_category`
- `client_order_summary`
- `order_client_id`

Mais il manque probablement une categorie metier explicite pour:
- "venue mais n'a pas passe GICOP"

### Proposition technique

Creer deux briques:

#### 1. Batch d'obligation
Entite:
- `CommercialObligationBatch`

Champs:
- `id`
- `commercial_id`
- `trigger_count`
- `triggered_at`
- `status`
- `quality_check_status`

#### 2. Taches d'appel
Entite:
- `CallTask`

Champs:
- `id`
- `batch_id`
- `commercial_id`
- `contact_id`
- `task_type`
- `min_duration_sec`
- `status`
- `completed_at`
- `validated`

### Regle de declenchement

- a chaque `conversation.result_set`
- compter les conversations terminees par commercial
- a chaque multiple de 10, generer un batch

### Validation des appels

Le module `call-log` existe deja.

Une tache est validee si:
- un `call_log` associe existe
- `duration_sec >= 90`

### Controle qualite sur les 10 derniers messages

Besoin exprime:
- verifier que le commercial a repondu sans erreur aux 10 derniers messages
- le commercial doit avoir la derniere reponse

### Proposition technique

Creer un `ConversationQualityService`

#### Controle automatique minimum
- sur les 10 derniers messages:
  - le dernier message doit etre sortant commercial
  - pas de message client abandonne au-dela du SLA

#### Controle etendu possible
- score qualite
- aide IA ou checklist

### Travaux backend

- service `CommercialMilestoneService`
- listener sur fin de conversation
- generation des batches
- appariement avec `call_log`
- service de score qualite conversation

### Travaux front

- vue "obligations d'appels"
- progression du batch
- statut des taches completes / restantes

### Travaux admin

- suivi global par commercial
- taux de completion
- batches en retard
- score qualite des conversations

### Questions metier a trancher

- qu'est-ce qu'une conversation "terminee" exactement ?
- les annulations comptent-elles dans le seuil de 10 ?
- comment identifier rigoureusement la categorie "venue sans passer GICOP" ?

---

## 5.7. Relance automatique et prise de rendez-vous

### Objectif

Apres chaque enregistrement de relance, le systeme doit envoyer un message de prise de rendez-vous a la date souhaitee du client comme rappel de prise de contact.

### Existant

Le module `follow-up`:
- cree la relance
- la planifie
- la suit

Mais il ne programme pas de message automatique a echeance.

### Proposition technique

Ajouter un module:
- `follow-up-messaging`

### Fonctionnement cible

- une relance est enregistree
- si une date est definie:
  - programmer un message de rappel
- a l'echeance:
  - envoyer le message
- journaliser le resultat

### Evolutions de donnees possibles

Option 1:
- enrichir `follow_up`

Champs supplementaires:
- `reminder_message_status`
- `reminder_sent_at`
- `reminder_message_id`

Option 2:
- creer une table `scheduled_message`

### Regles d'envoi

- si la fenetre 24h WhatsApp est ouverte -> message libre
- sinon -> template approuve obligatoire

### Travaux backend

- listener sur `follow_up.created`
- cron ou ordonnanceur de messages
- routage via `communication_whapi`

### Travaux front

- option "envoyer rappel automatique"
- previsualisation du message
- historique d'envoi

### Travaux admin

- suivi des rappels envoyes / echoues

---

## 5.8. Envoi automatique du recapitulatif commande + photo produit

### Objectif

Des qu'une commande est enregistree sur une nouvelle conversation et que les 24h ne sont pas fermees, le systeme envoie au client:
- le recapitulatif de la commande
- la photo du produit

### Existant

L'integration entrante commande existe partiellement:
- reception `order_created`
- mise a jour de categorie client

Mais pas de composition du recap ni d'envoi automatique.

### Pre-requis

L'ERP doit fournir:
- detail commande
- items
- photo ou URL photo
- identification du client WhatsApp

### Travaux backend

Etendre `InboundIntegrationService` pour:
- consommer les details de commande
- verifier si la conversation est encore dans la fenetre 24h
- composer le message recapitulatif
- envoyer texte + image

### Journalisation

Tracer:
- evenement recu
- message envoye
- succes / echec
- cause d'echec

### Travaux front

- afficher dans l'historique qu'un recap commande a ete envoye

### Travaux admin

- logs d'automatisation
- reprise manuelle si echec

### Point critique

La definition de "nouvelle conversation" et "fenetre 24h ouverte" doit etre formalisee cote backend.

---

## 5.9. Envoi automatique du code d'expedition

### Objectif

Des qu'un code d'expedition est genere, le systeme doit l'envoyer au numero WhatsApp de la cliente.

### Existant

Ce besoin n'est pas implemente.

### Proposition technique

Ajouter un nouvel evenement ERP entrant du type:
- `shipment_code_created`
- ou equivalent

### Donnees attendues

- `client_id` ou telephone
- `shipment_code`
- `order_id`
- `created_at`

### Travaux backend

- etendre `InboundIntegrationService`
- retrouver le contact via:
  - `order_client_id`
  - ou telephone
- envoyer le message de code d'expedition
- tracer l'envoi

### Travaux front

- afficher le dernier code d'expedition envoye dans le dossier client ou la timeline

### Travaux admin

- afficher les envois automatiques d'expedition
- relance manuelle possible

---

## 5.10. Bouton d'envoi de categories d'information multimedia

### Objectif

Dans le chat, le commercial doit pouvoir envoyer rapidement des categories d'information a une cliente:
- utilisation d'un produit ou d'une gamme
- numero de telephone de depot
- carte de visite de la commerciale
- autres

Ces contenus doivent pouvoir inclure:
- texte
- image
- video
- document

### Existant

Les canned responses couvrent:
- texte
- suggestions rapides

Mais ne couvrent pas:
- vrai catalogue metier multimedia
- sequences de contenus
- gestion admin des assets d'information

### Proposition technique

Creer un module:
- `information-catalog`

### Entite recommandee

`InformationCategoryAsset`

Champs suggeres:
- `id`
- `tenant_id`
- `poste_id` nullable
- `category`
- `title`
- `description`
- `text_content`
- `media_type`
- `media_url`
- `document_url`
- `sort_order`
- `is_active`

### Fonctionnement cible

- le commercial clique sur un bouton dans le chat
- choisit une categorie
- choisit un contenu
- previsualise
- envoie

### Travaux backend

- CRUD admin des contenus
- listing par categorie
- endpoint d'envoi direct

### Travaux front

- bouton dedie dans `ChatInput`
- modal de choix
- previsualisation
- envoi en un clic

### Travaux admin

- ecran de gestion de bibliotheque
- upload medias
- activation / desactivation
- ciblage par tenant et poste

---

## 6. Lots techniques transverses necessaires

## 6.1. Evolutions de base de donnees a prevoir

Tables ou champs a ajouter:
- `conversation_report`
- `conversation_rating`
- `commercial_obligation_batch`
- `call_task`
- `information_category_asset`
- `contact_assignment_affinity` ou equivalent
- eventuellement `outbound_automation_log`

### Champs potentiels supplementaires

Sur `follow_up`:
- `reminder_message_status`
- `reminder_sent_at`
- `reminder_message_id`

Sur `whatsapp_chat` si version simple choisie:
- `sticky_poste_id`
- `sticky_assigned_at`

---

## 6.2. Evenements metier a standardiser

Evenements entrants:
- `order_created`
- `order_updated`
- `order_cancelled`
- `shipment_code_created`
- `client_order_summary_updated`
- `client_certification_updated`
- `referral_updated`

Evenements internes:
- `conversation.result_set`
- `follow_up.created`
- `follow_up.completed`
- `conversation.closed`
- `rating.received`
- `call_task.completed`

---

## 6.3. Journalisation et audit

Toutes les regles critiques doivent etre tracables:
- pourquoi une conversation est revenue ou non sur le poste historique
- pourquoi une conversation a ete verrouillee au-dela de 10
- pourquoi une relance automatique a ete envoyee ou non
- quel evenement ERP a declenche un message automatique
- quelles taches d'appel ont ete validees ou refusees

---

## 7. Plan de livraison recommande

### Phase 0
- correction du `RedisModule`
- stabilisation du demarrage backend

### Phase 1
- affectation persistante au meme poste
- limite stricte a 10 conversations actives

### Phase 2
- rapport obligatoire de qualification conversationnelle
- renforcement de la cloture conversation

### Phase 3
- notation client de fin de conversation
- relance automatique a date

### Phase 4
- moteur de batch "10 conversations terminees"
- taches d'appels obligatoires
- controle qualite des 10 derniers messages

### Phase 5
- integration ERP enrichie pour recap commande + photo
- envoi automatique du code d'expedition

### Phase 6
- catalogue multimedia d'informations
- boutons d'envoi categories dans le chat

### Phase 7
- dashboards de pilotage commercial et admin
- conformite et exploitation

---

## 8. Decoupage en lots projet

## Lot A - Stabilisation plateforme

Contenu:
- correction circular dependency Redis
- validation build
- validation boot Docker

Livrables:
- backend deployable

## Lot B - Affectation et capacite

Contenu:
- sticky assignment
- quota 10 strict
- affichage front de capacite

Livrables:
- conversations reviennent au meme poste
- impossibilite de depasser 10 actifs

## Lot C - Rapport conversationnel

Contenu:
- module `conversation-report`
- API
- panneau front
- blocage a la cloture

Livrables:
- qualification structuree obligatoire

## Lot D - Sortie conversation et satisfaction

Contenu:
- cloture metier renforcee
- envoi notation client
- stockage des notes

Livrables:
- fin de conversation exploitable

## Lot E - Obligations d'appels

Contenu:
- moteur de lots par tranche de 10
- segmentation clients
- appariement `call_log`
- controle qualite

Livrables:
- taches d'appels generees et suivies

## Lot F - Automatisation ERP

Contenu:
- recap commande + photo
- code d'expedition
- logs d'automatisation

Livrables:
- boucle conversation -> commande -> suivi

## Lot G - Catalogue d'informations

Contenu:
- bibliotheque multimedia
- UI admin
- bouton d'envoi dans chat

Livrables:
- envoi rapide de contenus GICOP standardises

---

## 9. Tests indispensables

### Tests backend

- tests unitaires du dispatcher
- tests unitaires de la capacite
- tests unitaires du moteur de batch d'appels
- tests unitaires des listeners d'automatisation

### Tests e2e

- webhook entrant -> affectation sticky
- 11e conversation -> non active
- conversation sans rapport -> cloture refusee
- relance creee -> message planifie
- `order_created` -> recap envoye
- `shipment_code_created` -> code envoye
- fin de conversation -> notation envoyee

### Tests de migration

- migration sur base existante
- non-regression sur production-like data

### Tests front

- affichage rapport
- blocage de fermeture
- affichage quota
- envoi categorie multimedia

---

## 10. Risques principaux

### Risque 1 - Dette technique Nest / Redis
- peut bloquer tout deploiement

### Risque 2 - Ambiguite metier sur "poste affecte"
- confusion possible entre poste, commercial, file et poste de connexion

### Risque 3 - Donnees ERP insuffisantes
- certains lots dependent de payloads plus riches que ceux deja branches

### Risque 4 - Surcharge UX
- le rapport ne doit pas rendre l'ecran chat inutilisable

### Risque 5 - Regles WhatsApp 24h / templates
- les automatisations doivent respecter les contraintes de fenetre d'envoi

---

## 11. Decisions metier a valider avant implementation

### Affectation persistante
- si le poste historique est offline, faut-il attendre ou redistribuer ?
- un transfert manuel casse-t-il l'affectation historique ?

### Rapport obligatoire
- obligatoire des le premier message ?
- ou obligatoire avant cloture / transfert ?

### Limite 10 simultanes
- 10 conversations visibles ?
- ou 10 conversations avec droit de reponse ?

### Bloc de 10 conversations terminees
- qu'est-ce qu'une conversation terminee exactement ?
- les annulees comptent-elles ?

### Segmentation appels
- comment identifier "venue mais n'a pas passe GICOP" ?

### Notation client
- note seule ou note + commentaire ?

### Messages automatiques
- hors fenetre 24h:
  - template approuve obligatoire ?
  - quels templates doivent etre prepares ?

---

## 12. Conclusion strategique

La plateforme n'est pas a refaire.

Le socle conversationnel est deja tres avance et couvre:
- dispatch
- capacite
- qualification
- relances
- dossier client
- journalisation appels
- integration ERP partielle

Le chantier GICOP consiste surtout a:
- stabiliser la branche techniquement
- durcir les regles d'affectation et de charge
- ajouter un rapport conversationnel obligatoire
- transformer la fin de conversation en sortie metier stricte
- generer des obligations d'appels pilotees par des regles
- completer l'automatisation ERP
- industrialiser l'envoi de contenus categories multimedia

La sequence recommandee est:
1. stabilisation Redis / demarrage backend
2. sticky assignment + quota 10
3. rapport obligatoire
4. cloture metier + relances + notation
5. batches d'appels et controle qualite
6. automatisations commande / expedition
7. catalogue multimedia
8. dashboards de pilotage

Ce plan permet une mise en oeuvre progressive sans casser l'existant, tout en alignant la plateforme sur la cible operationnelle GICOP.
