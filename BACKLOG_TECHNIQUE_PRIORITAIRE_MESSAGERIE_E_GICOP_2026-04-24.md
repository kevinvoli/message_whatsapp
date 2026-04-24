# Backlog Technique Prioritaire Messagerie E-GICOP

Date: 2026-04-24

## Objectif

Ce backlog traduit le plan d'implementation prioritaire en epics, user stories, taches techniques et criteres d'acceptation.

Le perimetre est limite aux priorites suivantes:

- fermeture conversationnelle
- notification d'appels
- envoi du rapport vers la plateforme de gestion des commandes
- rappel automatique a la date de relance
- menus metier dedies
- priorisation appels en absence / messages poste

## Priorisation globale

- `P0`: indispensable pour demarrer le process metier cible
- `P1`: indispensable juste apres le socle P0
- `P2`: important mais non bloquant pour la premiere mise en production ciblee

## Epic 1. Fermeture conversationnelle guidee

Priorite: `P0`

### Objectif

Bloquer toute fermeture de conversation tant que les conditions metier ne sont pas remplies.

### User story 1.1

En tant que commerciale, je veux fermer une conversation via un workflow unique pour savoir exactement ce qui manque avant cloture.

#### Taches backend

- creer un service `ConversationClosureService`
- centraliser toutes les regles de cloture dans ce service
- ajouter une methode `validateClosure(chatId, commercialId)`
- ajouter une methode `closeConversation(chatId, commercialId, payload)`
- retourner une liste structuree des blocages
- journaliser les tentatives de fermeture refusees
- journaliser les fermetures valides

#### Taches frontend

- creer une modal unique de fermeture
- afficher les blocages metier de maniere lisible
- afficher les champs manquants
- interdire le bouton final tant que les preconditions ne sont pas satisfaites
- pre-remplir la modal avec les donnees deja presentes

#### Criteres d'acceptation

- une conversation incomplete ne peut pas etre fermee
- les raisons de blocage sont visibles
- le workflow est unique et remplace les actions de fermeture dispersees
- chaque fermeture laissee passer est tracee

### User story 1.2

En tant que superviseur, je veux connaitre pourquoi une conversation est bloquee a la fermeture.

#### Taches backend

- exposer un statut de closure readiness
- ajouter des codes de blocage normalises
- prevoir un endpoint de lecture admin

#### Taches frontend

- afficher dans l'admin les motifs de blocage de fermeture
- afficher le dernier essai de cloture

#### Criteres d'acceptation

- l'admin peut voir les causes principales de blocage
- les motifs sont homogenes et exploitables

### Sous-taches techniques

- definir les regles minimales:
  - dossier complet
  - rapport complet
  - resultat conversation renseigne
  - prochaine action renseignee
  - relance planifiee si necessaire
  - obligations d'appel conformes si blocantes
- ajouter des tests unitaires du moteur de regles
- ajouter des tests e2e de fermeture

## Epic 2. Notification d'appels depuis la plateforme de prise de commande

Priorite: `P0`

### Objectif

Recevoir chaque appel effectue par une commerciale et l'utiliser pour les validations metier.

### User story 2.1

En tant que systeme messagerie, je veux recevoir un webhook d'appel contenant le numero ou email de la commerciale pour rattacher l'appel au bon traitement.

#### Taches backend

- definir le contrat webhook `POST /gicop-webhook/call-events`
- accepter:
  - `external_id`
  - `event_at`
  - `client_phone`
  - `commercial_phone`
  - `commercial_email`
  - `call_status`
  - `duration_seconds`
  - `recording_url`
- dedupliquer par `external_id`
- resoudre le commercial par numero
- fallback de resolution par email
- resoudre le client par numero
- corriger le moteur de correlation si plusieurs conversations sont possibles

#### Taches frontend

- aucune obligatoire pour la reception brute

#### Criteres d'acceptation

- un appel entrant cree un evenement unique
- le commercial est retrouve via numero ou email
- le client est rapproche si possible
- un doublon n'est pas reinjecte

### User story 2.2

En tant que manager, je veux que les appels alimentent automatiquement les obligations de validation.

#### Taches backend

- brancher les call events vers `CallObligationService`
- enregistrer la duree d'appel retenue
- alimenter les compteurs annulee / livree / sans commande
- exposer l'etat courant du batch d'obligations
- logger les appels ignores et leur raison

#### Taches frontend

- afficher en temps reel la progression des obligations
- afficher l'appel recu si pertinent dans le poste

#### Criteres d'acceptation

- un appel >= 90 secondes met a jour les obligations si les conditions sont remplies
- un appel non conforme est ignore avec motif
- la progression est visible cote operateur

### Sous-taches techniques

- ajouter tests de mapping commercial par email
- ajouter tests de correlation appel -> conversation
- ajouter tests de deduplication webhook

## Epic 3. Soumission du rapport vers la plateforme de gestion des commandes

Priorite: `P0`

### Objectif

Envoyer automatiquement le rapport complet avec l'identite de la commerciale a la plateforme de gestion des commandes.

### User story 3.1

En tant que systeme, je veux transmettre un rapport complet a la plateforme commande des qu'il est soumis.

#### Taches backend

- creer un evenement `conversation.report.submitted`
- creer un service `ReportSubmissionService`
- verifier la completude avant soumission
- enrichir le payload avec:
  - numero commercial
  - email commercial
  - nom commercial
  - date de soumission
- creer un `OrderPlatformSyncService`
- envoyer le payload a la plateforme externe
- stocker un statut:
  - `pending`
  - `sent`
  - `failed`
- stocker le detail d'erreur externe si present

#### Taches frontend

- ajouter un bouton "Soumettre le rapport"
- afficher l'etat de synchronisation du rapport
- afficher une erreur claire si la soumission est impossible car le rapport est incomplet

#### Criteres d'acceptation

- un rapport complet peut etre soumis
- le payload contient bien les infos du rapport et de la commerciale
- le statut d'envoi est memorise
- un echec externe ne supprime pas le rapport

### User story 3.2

En tant que superviseur, je veux suivre les rapports non envoyes ou en echec.

#### Taches backend

- exposer une liste admin des rapports en echec
- ajouter retries automatiques
- ajouter relecture du statut d'un rapport

#### Taches frontend

- ajouter une vue admin de supervision des synchronisations
- permettre un retry manuel

#### Criteres d'acceptation

- les rapports en echec sont visibles
- un retry manuel ou automatique est possible

### Sous-taches techniques

- definir le schema de payload sortant
- definir la politique de retry
- ajouter des tests d'integration sortante mockee

## Epic 4. Rappel automatique a la date de relance

Priorite: `P1`

### Objectif

Declencher automatiquement un rappel interne a l'echeance d'une relance.

### User story 4.1

En tant que commerciale, je veux etre notifiee quand une relance arrive a echeance.

#### Taches backend

- ajouter un job `FollowUpReminderJob`
- rechercher les relances a echeance
- eviter les doubles envois
- creer une notification interne
- stocker la date d'execution du rappel

#### Taches frontend

- afficher les rappels dans le panneau relances
- afficher un badge ou compteur de relances arrivees
- permettre d'ouvrir directement la conversation ou le dossier

#### Criteres d'acceptation

- une relance a echeance genere une notification
- une relance ne notifie pas deux fois sans raison
- la commerciale peut agir directement depuis le rappel

### Sous-taches techniques

- ajouter un champ technique sur `follow_up` pour tracer le rappel
- tester le job de rappel

## Epic 5. Menus metier dedies

Priorite: `P1`

### Objectif

Afficher des listes metier directement exploitables sans passer par des filtres generiques.

### User story 5.1

En tant que commerciale, je veux voir un menu "Prospects a relancer" pour traiter les clients n'ayant pas encore converti.

#### Taches backend

- creer un endpoint dedie prospects
- filtrer `jamais_commande` et `commande_sans_livraison`
- trier par priorite et derniere activite

#### Taches frontend

- creer la vue "Prospects"
- ajouter compteurs
- ajouter acces rapide a:
  - appeler
  - ouvrir conversation
  - ouvrir dossier
  - planifier relance

#### Criteres d'acceptation

- la liste remonte uniquement les prospects cibles
- les actions principales sont accessibles en un clic

### User story 5.2

En tant que commerciale, je veux voir un menu "Commandes annulees" pour relancer les clientes concernees.

#### Taches backend

- creer un endpoint dedie annulees
- filtrer `commande_annulee`

#### Taches frontend

- creer la vue "Commandes annulees"
- afficher les informations essentielles

#### Criteres d'acceptation

- la liste annulee est separee des autres categories

### User story 5.3

En tant que commerciale, je veux voir un menu "Anciennes clientes" pour relancer celles qui n'ont plus commande depuis plus de 60 jours.

#### Taches backend

- definir la regle des 60 jours
- creer un endpoint dedie

#### Taches frontend

- creer la vue "Anciennes clientes"
- afficher date de derniere activite

#### Criteres d'acceptation

- seules les clientes correspondant a la regle apparaissent

## Epic 6. Priorisation appels en absence et messages du poste

Priorite: `P1`

### Objectif

Mettre les urgences du poste avant les autres traitements.

### User story 6.1

En tant que commerciale, je veux voir immediatement les appels en absence de mon poste avant d'autres actions.

#### Taches backend

- ajouter une notion de priorite poste
- exposer les appels en absence non traites
- marquer un appel en absence comme traite

#### Taches frontend

- creer un bloc prioritaire "Appels en absence"
- afficher compteur
- ouvrir directement la fiche ou conversation associee

#### Criteres d'acceptation

- les appels en absence apparaissent dans une zone prioritaire
- le traitement les retire de la liste

### User story 6.2

En tant que commerciale, je veux voir les messages du poste non replies avant de poursuivre les autres traitements.

#### Taches backend

- exposer les conversations prioritaires du poste
- definir la regle "message recu non traite"

#### Taches frontend

- creer un bloc prioritaire "Messages du poste"
- afficher compteur
- ajouter acces direct a la conversation

#### Criteres d'acceptation

- les messages prioritaires sont visibles des l'ouverture
- le compteur baisse apres traitement

### User story 6.3

En tant que systeme, je veux bloquer partiellement certaines actions si les priorites poste sont critiques.

#### Taches backend

- definir des seuils de blocage
- exposer un statut de criticite

#### Taches frontend

- bloquer ou avertir sur certaines actions:
  - fermeture conversation
  - rotation si applicable
  - changement de vue si necessaire

#### Criteres d'acceptation

- les blocages ne sont appliques qu'aux cas critiques
- les raisons du blocage sont explicites

## Epic 7. Supervision et observabilite metier

Priorite: `P2`

### Objectif

Permettre le suivi des flux critiques et des echecs metier.

### User story 7.1

En tant qu'admin, je veux suivre les flux critiques de messagerie pour corriger rapidement les anomalies.

#### Taches backend

- ajouter des logs metier normalises
- ajouter des compteurs:
  - appels recus
  - appels rejetes
  - rapports soumis
  - rapports en echec
  - fermetures bloquees
  - rappels executes

#### Taches frontend

- ajouter une vue admin de supervision simple

#### Criteres d'acceptation

- les flux critiques sont visibles sans devoir lire les logs bruts

## Sprint recommande

## Sprint 1

- Epic 1 complet
- Epic 2 user story 2.1
- Epic 3 user story 3.1 base technique

## Sprint 2

- Epic 2 user story 2.2
- Epic 3 user story 3.2
- Epic 4 complet

## Sprint 3

- Epic 5 complet
- Epic 6 user stories 6.1 et 6.2

## Sprint 4

- Epic 6 user story 6.3
- Epic 7 complet
- durcissement, QA et corrections

## Definition of Done globale

- chaque flux prioritaire a au moins un test backend
- chaque ecran critique est teste manuellement
- chaque integration externe a une strategie de retry ou reprise
- aucun flux critique ne depend d'une saisie hors workflow
- les erreurs sont visibles et actionnables

## Livrables finaux attendus

- fermeture conversationnelle unifiee et bloquee si incomplete
- reception exploitable des appels de la plateforme de prise de commande
- alimentation automatique des validations d'appel
- envoi automatique du rapport complet vers la plateforme de gestion des commandes
- rappels automatiques de relance
- menus metier dedies
- priorites poste visibles et traitees
