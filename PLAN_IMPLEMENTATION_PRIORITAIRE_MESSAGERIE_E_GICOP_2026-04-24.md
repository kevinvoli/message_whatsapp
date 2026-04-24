# Plan d'Implementation Prioritaire Messagerie E-GICOP

Date: 2026-04-24

## Objectif

Ce plan se concentre uniquement sur les flux prioritaires du projet de messagerie, en s'appuyant sur les rapports d'etat des lieux deja produits.

Les priorites demandees sont:

1. fermeture conversationnelle
2. rappel automatique a la date de relance
3. menus metier dedies prospects / annules / anciens clients
4. priorisation appels en absence / messages du poste
5. integration des notifications d'appels
6. integration des rapports conversationnels vers la plateforme de gestion des commandes

Le focus principal est le processus de fermeture des conversations, puis les notifications d'appel et enfin les integrations metier autour du rapport commercial.

## Principe directeur

Le systeme doit imposer un flux metier rigide:

- une conversation ne se ferme pas tant que toutes les conditions de fermeture ne sont pas remplies
- chaque appel remonte depuis la plateforme de prise de commande vers la messagerie
- chaque rapport rempli par la commerciale remonte vers la plateforme de gestion des commandes
- les priorites metier doivent passer avant le traitement libre des conversations

## Flux principal prioritaire

### Flux 1. Fermeture conversationnelle

Objectif:

- rendre impossible une fermeture de conversation incomplete
- centraliser les validations dans un seul workflow

Regles cibles:

- une conversation ne peut etre fermee que si le rapport est complet
- si une relance est necessaire, elle doit etre planifiee avant fermeture
- si un appel est requis par les regles du poste, la fermeture reste bloquee
- si des priorites plus fortes existent sur le poste, la fermeture doit les signaler clairement

Conditions minimales de fermeture:

- dossier client complet
- rapport conversationnel complet
- resultat de conversation renseigne
- prochaine action definie
- relance planifiee si le resultat n'est pas definitif
- obligations d'appels validees si elles bloquent la rotation

Sorties possibles de fermeture:

- fermee avec succes
- fermee avec relance planifiee
- bloquee car dossier incomplet
- bloquee car appel manquant
- bloquee car priorites poste non traitees

### Flux 2. Notification d'appel entrant depuis la plateforme de prise de commande

Objectif:

- recuperer chaque appel effectue par une commerciale
- exploiter cet appel pour les regles de validation

Payload minimal attendu depuis la plateforme de prise de commande:

- identifiant unique d'appel
- date et heure de l'appel
- numero cliente
- numero commercial et/ou email commercial
- duree d'appel
- statut d'appel
- url d'enregistrement si disponible

Traitement cible:

1. reception webhook/appel entrant
2. identification du commercial via numero ou email
3. identification du contact/client
4. correlation avec conversation existante
5. creation de l'evenement d'appel
6. evaluation des conditions de validation metier
7. mise a jour du statut des obligations d'appel
8. notification temps reel dans l'interface si necessaire

### Flux 3. Envoi du rapport conversationnel vers la plateforme de gestion des commandes

Objectif:

- envoyer les informations completes du rapport au systeme de gestion des commandes

Donnees a transmettre:

- identifiant conversation
- identifiant contact si disponible
- nom et prenoms client
- ville, commune, quartier
- categorie produit
- autres numeros
- besoin client
- score d'interet
- indicateur homme non interesse
- date de relance
- prochaine action
- notes
- numero et/ou email de la commerciale ayant rempli le rapport
- date et heure de soumission du rapport

Traitement cible:

1. la commerciale sauvegarde puis soumet le rapport
2. le backend verifie la completude
3. le backend enrichit le payload avec les infos de la commerciale
4. le backend envoie le rapport a la plateforme de gestion des commandes
5. la plateforme distante accuse reception
6. le backend memorise le statut d'envoi
7. si echec, reprise automatique ou file d'attente de retry

## Fonctionnalites prioritaires a implementer

## 1. Workflow unique de fermeture conversationnelle

### But

Transformer la fermeture de conversation en processus guide et bloque tant que tout n'est pas valide.

### A implementer

- un service central `ConversationClosureService`
- une route backend dediee de type `POST /conversations/:chatId/close`
- un moteur de regles de fermeture
- une reponse detaillee listant toutes les raisons de blocage
- une modal de fermeture unique cote front

### Verifications dans le workflow

- dossier client complet
- rapport conversationnel complet
- conversation_result renseigne
- relance obligatoire ou non
- appels obligatoires completes
- dernier message bien tenu par la commerciale si cette regle s'applique
- priorites poste non traitees

### Resultat attendu

La fermeture ne doit plus etre une action simple. Elle devient une operation metier validee.

## 2. Rappel automatique a la date de relance

### But

Faire en sorte qu'une relance planifiee produise automatiquement une notification et/ou un message selon la regle choisie.

### A implementer

- ajout d'un job planificateur sur les `follow_up`
- statut technique d'execution du rappel
- notification interne pour la commerciale
- option d'envoi externe si le process GICOP le demande plus tard

### Etapes

1. scanner les relances arrivant a echeance
2. verifier que la relance n'a pas deja ete executee
3. generer une notification interne
4. marquer la relance comme notifiee
5. journaliser l'action

### Resultat attendu

Chaque relance planifiee devient actionnable automatiquement au bon moment.

## 3. Menus metier dedies

### But

Sortir de la logique generique "contacts" pour afficher de vraies listes metier exploitables.

### Menus a creer

- prospects a relancer
- commandes annulees a rappeler
- anciens clients a relancer

### Critere de classement initial

- prospects: `jamais_commande` ou `commande_sans_livraison`
- annules: `commande_annulee`
- anciens clients: clients sans activite depuis plus de 60 jours

### A implementer

- endpoints backend filtres
- vues front dediees
- compteurs par menu
- raccourcis vers appel, dossier, relance, conversation

### Resultat attendu

Les commerciales et superviseurs voient immediatement les viviers prioritaires sans passer par une recherche libre.

## 4. Priorisation appels en absence et messages poste

### But

Imposer un ordre de traitement metier avant les actions normales.

### Regle cible

Avant de fermer ou de poursuivre librement certaines operations, le systeme doit mettre en avant:

- appels en absence du poste
- messages recus sur le poste non traites

### A implementer

- file de priorites du poste
- compteur global de priorites
- bloc visuel dans l'interface operateur
- blocage partiel de certaines actions si priorites critiques non traitees

### Sources de donnees

- appels en absence remontes par webhook/appel
- conversations avec messages entrants non replies

### Resultat attendu

Le systeme force un traitement discipline des urgences avant le reste.

## 5. Integration des notifications d'appel

### But

Connecter proprement la plateforme de prise de commande a la messagerie.

### Contrat d'integration cible

Endpoint cible propose:

- `POST /gicop-webhook/call-events`

Champs minimaux:

- `external_id`
- `event_at`
- `client_phone`
- `commercial_phone`
- `commercial_email`
- `call_status`
- `duration_seconds`
- `recording_url`

### Regles de traitement

- deduplication par `external_id`
- rapprochement par numero client
- rapprochement commercial par numero puis email
- mise a jour des obligations d'appel
- emission d'evenement metier interne

### Resultat attendu

Chaque appel fait par une commerciale alimente automatiquement les conditions de validation.

## 6. Integration des rapports vers la plateforme de gestion des commandes

### But

Faire du rapport commercial une veritable sortie metier exploitable par la plateforme commande.

### A implementer

- evenement `conversation.report.submitted`
- service `OrderPlatformSyncService`
- payload normalise
- logs d'envoi
- retries en cas d'echec
- statut de synchronisation visible

### Regles

- l'envoi ne se fait qu'apres rapport complet
- l'identite de la commerciale est obligatoire dans le payload
- si numero et email existent, envoyer les deux
- en cas d'echec distant, ne pas perdre le rapport

### Resultat attendu

Le rapport n'est plus seulement stocke localement; il alimente la plateforme metier cible.

## Architecture d'implementation recommandee

## Backend

### Nouveaux services

- `ConversationClosureService`
- `PostePriorityService`
- `CallEventIngestionService` si separation voulue du service actuel
- `ReportSubmissionService`
- `OrderPlatformSyncService`
- `FollowUpReminderJob`

### Extensions sur modules existants

- `gicop-report`
- `client-dossier`
- `follow-up`
- `call-obligations`
- `window`
- `gicop-webhook`
- `notification`
- `integration`

## Front operateur

### Ecrans / composants a ajouter ou renforcer

- modal unique de fermeture conversationnelle
- centre de priorites poste
- vues dediees prospects / annules / anciens clients
- indicateur d'etat de synchronisation rapport
- panneau relances avec notifications d'echeance

## Admin / supervision

- suivi des appels recus
- suivi des rapports envoyes vers la plateforme commande
- logs des echecs de synchronisation
- configuration des regles de blocage fermeture

## Ordre d'implementation recommande

## Phase 1. Fermeture conversationnelle

Priorite absolue.

Livrables:

- service central de fermeture
- endpoint de cloture
- modal front de cloture
- retour detaille des blocages
- journalisation des causes de refus

## Phase 2. Notification d'appel et validation appels

Deuxieme priorite.

Livrables:

- webhook d'appel stabilise
- mapping commercial par numero/email
- alimentation des obligations d'appel
- affichage UI des appels pertinents

## Phase 3. Soumission rapport vers plateforme commande

Troisieme priorite.

Livrables:

- evenement de soumission
- payload complet enrichi de la commerciale
- connecteur sortant
- retries et logs

## Phase 4. Rappel automatique de relance

Quatrieme priorite.

Livrables:

- cron ou queue de rappel
- notification interne
- statut d'execution

## Phase 5. Menus metier dedies

Cinquieme priorite.

Livrables:

- vues prospects
- vues annules
- vues anciens clients
- filtres et compteurs

## Phase 6. Priorisation appels/messages poste

Sixieme priorite mais a brancher tot des que la couche de priorite existe.

Livrables:

- centre de priorite poste
- regles de blocage partiel
- indicateurs de messages/appels en attente

## Definition de done par fonctionnalite

### Fermeture conversationnelle

- impossible de fermer une conversation incomplete
- toutes les raisons de blocage sont visibles
- fermeture journalisee
- testee backend et front

### Notification d'appel

- un appel recu cree un evenement unique
- le commercial est resolu via numero ou email
- la validation metier est mise a jour
- les doublons sont ignores proprement

### Envoi rapport

- le rapport complet part automatiquement
- le payload contient l'identite commerciale
- les echecs sont retries
- l'etat de sync est tracable

### Relance automatique

- chaque relance a echeance genere son rappel
- pas de double execution
- traces disponibles

### Menus metier

- listes dediees fonctionnelles
- filtres exacts
- acces rapide aux actions metier

### Priorites poste

- appels/messages prioritaires visibles immediatement
- blocage ou avertissement actif selon regles

## Risques a anticiper

- qualite insuffisante du mapping commercial par numero/email
- payloads d'appel incomplets venant de la plateforme de prise de commande
- echec de synchronisation vers la plateforme commande
- multiplication des regles de blocage pouvant frustrer l'usage si l'UX est mauvaise
- incoherence entre rapport, dossier client et resultat de conversation si les regles ne sont pas centralisees

## Recommandation finale

Le chantier doit etre mene dans cet ordre:

1. verrouiller la fermeture conversationnelle
2. fiabiliser la remontee des appels
3. envoyer automatiquement les rapports vers la plateforme commande
4. declencher les rappels de relance
5. creer les menus metier dedies
6. imposer la priorisation appels/messages poste

Si ce plan est respecte, la messagerie passera d'un outil conversationnel avance a un veritable moteur d'execution commerciale discipline pour GICOP.
