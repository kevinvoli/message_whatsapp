# Plan D'Implementation Des Fonctionnalites De La Reunion

Date: 20 avril 2026

Portee:
- uniquement la plateforme conversationnelle
- backend `message_whatsapp`
- front commercial `front`
- panel admin `admin`

Base de travail:
- bilan de reunion deja redige
- documents d'integration et sources de verite
- analyse du code existant de la plateforme conversationnelle

Objectif:
- transformer les besoins exprimes en plan d'implementation realiste
- s'appuyer sur les modules deja existants
- separer clairement:
  - ce qui existe deja
  - ce qui doit etre etendu
  - ce qui doit etre cree

---

## 1. Resume executif

La plateforme conversationnelle dispose deja d'un socle solide:
- conversations temps reel
- dispatch et queue
- contact et call log
- CRM custom
- analytics
- RBAC
- SLA
- FlowBot
- notifications
- audit
- IA de suggestion et resume

Mais les besoins exprimes pendant la reunion depassent le fonctionnement actuel. Le chantier principal n'est pas de refaire la messagerie. Le vrai chantier est de faire evoluer la plateforme vers:
- un systeme de suivi client
- un outil de pilotage commercial
- un outil de gestion de charge des commerciaux
- un dossier client central

La bonne strategie est donc:
1. conserver le socle conversationnel existant
2. introduire progressivement un noyau de suivi client
3. brancher les nouvelles regles de gestion sur les conversations, les appels, le CRM et les dashboards

---

## 2. Lecture des besoins de la reunion par rapport au code existant

## 2.1. Ce qui existe deja dans le code

### 1. Contacts et suivi d'appel
Existant:
- `message_whatsapp/src/contact`
- `message_whatsapp/src/call-log`
- `front/src/components/contacts/ContactDetailView.tsx`
- `front/src/components/contacts/CallLogHistory.tsx`

Capacites deja presentes:
- contact
- statut d'appel
- date dernier appel
- prochaine date d'appel
- notes
- compteur d'appels
- historique des appels

### 2. CRM personnalisable
Existant:
- `message_whatsapp/src/crm`
- `admin/src/app/modules/crm/components/CrmView.tsx`
- `front/src/lib/contactApi.ts`

Capacites deja presentes:
- champs CRM custom
- valeurs par contact
- edition admin et agent

### 3. Suivi conversationnel
Existant:
- `message_whatsapp/src/whatsapp_chat`
- `message_whatsapp/src/whatsapp_message`
- `front/src/app/whatsapp/page.tsx`
- `front/src/components/sidebar`
- `front/src/components/chat`

Capacites deja presentes:
- gestion conversations
- messagerie temps reel
- lecture du detail
- transfert
- merge
- labels

### 4. Automatisation
Existant:
- `message_whatsapp/src/flowbot`
- `FLOWBOT_DOCUMENTATION.md`

Capacites deja presentes:
- bot et automatisations
- messages automatiques
- relances conditionnelles
- sessions
- triggers

### 5. Analytics et gouvernance
Existant:
- `message_whatsapp/src/analytics`
- `message_whatsapp/src/sla`
- `message_whatsapp/src/audit`
- `message_whatsapp/src/rbac`
- `admin/src/app/ui/OverviewView.tsx`

Capacites deja presentes:
- KPIs globaux
- performance agents
- SLA
- roles et permissions
- audit

### 6. IA
Existant:
- `message_whatsapp/src/ai-assistant`
- `message_whatsapp/src/sentiment`

Capacites deja presentes:
- suggestions de reponse
- resume conversation
- sentiment simple

## 2.2. Ce qui manque aujourd'hui

Manques majeurs constates:
- pas de vrai dossier client central
- pas de portefeuille client structure
- pas de statut metier complet de fin de conversation
- pas de systeme de relance robuste
- pas de regles de charge commerciales avancees
- pas de calcul d'heures de travail
- pas de classement commercial complet
- pas de certification client metier exploitable
- pas de categories client calculees et consolidees
- pas de module de parrainage
- pas d'integration native avec la plateforme de gestion des commandes

---

## 3. Principes d'implementation

## 3.1. Ne pas casser l'existant

Le plan doit reutiliser:
- `contact`
- `call_log`
- `crm`
- `whatsapp_chat`
- `whatsapp_message`
- `flowbot`
- `analytics`

## 3.2. Avancer par couches

Ordre recommande:
1. noyau de suivi client
2. statuts metier de conversation
3. relances et portefeuille
4. regles de charge commerciale
5. tableaux de bord et ranking
6. IA de correction et outils complementaires

## 3.3. Faire du backend la source du metier

Les regles critiques ne doivent pas vivre seulement dans le front:
- statuts finaux
- eligibilite de deblocage
- calculs de ranking
- portefeuille
- relances
- categories client

---

## 4. Plan d'implementation par fonctionnalite

## 4.1. Dossier client complet

### Priorite
Tres haute

### Objectif
Creer une fiche client exploitable et persistante dans la plateforme conversationnelle.

### Etat actuel
Base existante:
- `contact`
- `call_log`
- `crm`
- historique messages

### Travail a faire

#### Backend
- etendre l'entite `Contact` ou introduire une couche de projection client enrichie
- ajouter un service de lecture "dossier client"
- agregation:
  - informations contact
  - historiques messages
  - call logs
  - champs CRM
  - statuts relationnels
  - prochaines actions

#### Front
- refondre la fiche contact pour devenir une vraie fiche client
- dissocier la liste clients de la simple projection de conversations
- ajouter une vue complete par client

#### Admin
- permettre la consultation admin du dossier client

### Modules cibles
- `message_whatsapp/src/contact`
- `message_whatsapp/src/call-log`
- `message_whatsapp/src/crm`
- `front/src/components/contacts`
- `admin/src/app/ui/ClientsView.tsx`

### Dependances
- aucune dependance bloquante, mais cette brique servira a plusieurs autres

---

## 4.2. Statut metier de fin de conversation

### Priorite
Tres haute

### Objectif
Faire en sorte qu'une conversation ne se termine jamais sans resultat metier.

### Valeurs cibles minimales
- commande_confirmee
- commande_a_saisir
- a_relancer
- rappel_programme
- pas_interesse
- sans_reponse
- infos_incompletes
- annule

### Travail a faire

#### Backend
- ajouter un modele de statut metier au niveau conversation ou contact
- exposer API de mise a jour
- historiser les changements
- rendre ces statuts visibles dans les events temps reel

#### Front
- ajouter un formulaire de cloture ou qualification de conversation
- imposer la saisie d'un resultat metier avant certaines transitions

#### Admin
- filtrer et analyser les conversations par statut metier

### Modules cibles
- `message_whatsapp/src/whatsapp_chat`
- `message_whatsapp/src/whatsapp_message`
- `front/src/components/chat`
- `admin/src/app/ui/ConversationsView.tsx`

### Dependances
- dossier client
- regles de relance

---

## 4.3. Systeme de relance client

### Priorite
Tres haute

### Objectif
Planifier, suivre et executer les relances commerciales.

### Etat actuel
Elements partiels existants:
- `next_call_date`
- `call_status`
- `call_log`
- FlowBot

### Travail a faire

#### Backend
- creer un vrai modele de relance
- types:
  - rappel
  - relance post-conversation
  - relance sans commande
  - relance post-annulation
  - relance fidelisation
- statuts:
  - planifiee
  - en_retard
  - effectuee
  - annulee
- cron de surveillance
- notifications

#### Front
- vue "mes relances"
- affichage des relances dues aujourd'hui
- creation et completion de relance

#### Admin
- dashboard des relances en retard

### Modules cibles
- nouveau module backend `follow-up` ou extension `contact`
- `message_whatsapp/src/notification`
- `front/src/components/contacts`
- `admin/src/app/dashboard/commercial/page.tsx`

### Dependances
- statuts de conversation
- portefeuille commercial

---

## 4.4. Portefeuille client par commercial

### Priorite
Tres haute

### Objectif
Attribuer clairement des clients a des commerciaux.

### Travail a faire

#### Backend
- ajouter notion de proprietaire commercial du client
- API:
  - assigner portefeuille
  - reaffecter
  - lister portefeuille par commercial

#### Front
- vue "mon portefeuille"
- filtres par portefeuille

#### Admin
- affectation manuelle ou reglee
- supervision des portefeuilles

### Modules cibles
- `message_whatsapp/src/contact`
- `message_whatsapp/src/whatsapp_commercial`
- `front/src/app/contacts/page.tsx`
- `admin/src/app/ui/CommerciauxView.tsx`

### Dependances
- dossier client

---

## 4.5. Historique complet des interactions

### Priorite
Haute

### Objectif
Savoir avec qui le client a parle, quand, par quel canal, et avec quel resultat.

### Travail a faire

#### Backend
- creer une vue agregation interactionnelle
- consolider:
  - messages
  - appels
  - notes
  - statuts
  - relances

#### Front
- timeline relationnelle client

#### Admin
- historique consultable et exportable

### Modules cibles
- `message_whatsapp/src/whatsapp_message`
- `message_whatsapp/src/call-log`
- `front/src/components/contacts/ContactDetailView.tsx`

### Dependances
- dossier client

---

## 4.6. Categorisation client

### Priorite
Haute

### Objectif
Afficher des categories client coherentes dans la plateforme conversationnelle.

### Categories demandees
- commande sans livraison
- commande avec livraison
- jamais commande
- commande annulee

### Travail a faire

#### Backend
- ajouter champs ou projection de categorisation
- prevoir stockage temporaire en attendant la synchro complete avec la plateforme de gestion des commandes
- exposer les categories dans les APIs et sockets

#### Front
- badges
- filtres
- stats

#### Admin
- rapports par categorie

### Modules cibles
- `message_whatsapp/src/contact`
- `front/src/components/contacts`
- `admin/src/app/ui/ClientsView.tsx`

### Dependances
- integration webhooks avec la plateforme de gestion des commandes

---

## 4.7. Classement des commerciaux

### Priorite
Haute

### Objectif
Mettre en place un ranking commercial base sur des indicateurs mesurables.

### Indicateurs initiaux recommandes
- conversations traitees
- appels realises
- relances effectuees
- commandes initiees ou confirmees
- taux de transformation
- respect du traitement
- temps de reponse

### Travail a faire

#### Backend
- definir les metriques
- calculer un score ou plusieurs tableaux de classement
- stocker snapshots si necessaire

#### Admin
- tableau de classement
- filtres par periode

#### Front
- widget personnel du commercial

### Modules cibles
- `message_whatsapp/src/analytics`
- `message_whatsapp/src/metriques`
- `admin/src/app/ui/PerformanceView.tsx`
- `admin/src/app/ui/OverviewView.tsx`

### Dependances
- statut metier conversation
- relances
- portefeuille

---

## 4.8. Objectifs precis pour les commerciaux

### Priorite
Haute

### Objectif
Permettre a l'entreprise de fixer et suivre des objectifs.

### Travail a faire

#### Backend
- creer modele d'objectifs:
  - par commercial
  - par periode
  - par indicateur
- calcul de progression

#### Admin
- ecran d'administration des objectifs
- comparaison objectif vs realise

#### Front
- affichage du suivi d'objectif du commercial

### Modules cibles
- nouveau module `targets` ou extension analytics
- `admin`
- `front`

### Dependances
- analytics et ranking

---

## 4.9. Calcul des heures de travail des commerciaux

### Priorite
Haute

### Objectif
Mesurer la presence et l'activite reelle des commerciaux.

### Etat actuel
Existant:
- `WhatsappCommercial.isConnected`
- `lastConnectionAt`

### Travail a faire

#### Backend
- journaliser:
  - connexion
  - deconnexion
  - activite utile
- calculer:
  - debut de session
  - fin de session
  - duree totale
  - presence journaliere

#### Admin
- dashboard heures de travail

### Modules cibles
- `message_whatsapp/src/whatsapp_commercial`
- `message_whatsapp/src/analytics`
- `admin/src/app/ui/CommerciauxView.tsx`

### Dependances
- eventing presence

### Risque
- il faut distinguer heure de connexion et heure reellement travaillee

---

## 4.10. Restriction de connexion des commerciaux a l'entreprise

### Priorite
Haute

### Objectif
Empêcher les connexions hors cadre de travail.

### Travail a faire

#### Backend
- verifier IP source
- gerer whitelist IP entreprise
- option appareil autorise
- journaliser les refus

#### Front
- messages d'erreur explicites

#### Admin
- ecran de configuration des regles d'acces

### Modules cibles
- `message_whatsapp/src/auth`
- `message_whatsapp/src/auth_admin`
- `message_whatsapp/src/system-config`

### Dependances
- politique reseau / infrastructure

---

## 4.11. IA de correction de texte

### Priorite
Moyenne

### Objectif
Proposer une correction ou amelioration des messages du commercial avant envoi.

### Etat actuel
Existant:
- `AiAssistantService`

### Travail a faire

#### Backend
- ajouter endpoint de correction / reformulation
- eventuellement plusieurs modes:
  - correction simple
  - ton plus professionnel
  - reformulation courte

#### Front
- bouton "corriger"
- bouton "ameliorer"
- previsualisation avant envoi

### Modules cibles
- `message_whatsapp/src/ai-assistant`
- `front/src/components/chat/ChatInput.tsx`

### Dependances
- aucune dependance forte

---

## 4.12. Certification des comptes client

### Priorite
Moyenne

### Objectif
Afficher un statut de verification/certification client dans la plateforme conversationnelle.

### Travail a faire

#### Backend
- creer modele de certification minimal
- statuts:
  - non_verifie
  - en_attente
  - certifie
  - rejete
- prevoir reception via webhook depuis la plateforme de gestion si elle reste maitre

#### Front
- badge de certification

#### Admin
- filtre et supervision

### Modules cibles
- extension `contact` ou nouveau module `client-certification`
- `front`
- `admin`

### Dependances
- integration avec plateforme de gestion des commandes

---

## 4.13. Systeme de parrainage

### Priorite
Moyenne

### Objectif
Afficher et suivre les informations de parrainage dans la plateforme conversationnelle.

### Travail a faire

#### Backend
- modele de lecture du parrainage
- webhook entrant de synchronisation

#### Front
- affichage par client

#### Admin
- vue de suivi simple

### Modules cibles
- nouveau module `referral` ou projection client

### Dependances
- plateforme de gestion des commandes si source de verite

---

## 4.14. Dashboard technique serveur et applications

### Priorite
Moyenne

### Objectif
Afficher l'etat des serveurs et applications dans les dashboards conversationnels/admin.

### Etat actuel
Partiel:
- `OverviewView` expose deja certaines metriques ops et webhook

### Travail a faire

#### Backend
- endpoint technique ou projection de supervision
- metriques:
  - RAM
  - CPU
  - bande passante
  - sante apps

#### Admin
- bloc de sante technique

### Modules cibles
- `admin/src/app/ui/OverviewView.tsx`
- `admin/src/app/modules/observability`

### Dependances
- source supervision externe ou instrumentation

---

## 4.15. Restriction et deblocage des conversations par commercial

### Priorite
Critique

### Objectif
Appliquer les regles de gestion demandees:
- limite parametree a 50 conversations
- seulement 10 actives visibles
- les autres grisees
- deblocage sous conditions

### Etat actuel
Le dispatch, la queue et la conversation existent deja, mais pas cette logique de verrouillage metier.

### Travail a faire

#### Backend
- creer un moteur de regles de capacite commerciale
- concepts a ajouter:
  - quota total conversation
  - quota actif visible
  - conversation verrouillee/deverrouillee
  - critere de completion
- filtrer les conversations envoyees au front selon droit d'acces courant
- masquer:
  - messages
  - numero client
  - detail conversation

#### Front
- afficher 10 conversations actives
- afficher les autres en grise
- interdire affichage detail et reponse sur conversation verrouillee
- afficher compteur total poste / total commercial

#### Admin
- ecran de parametrage des quotas
- visualisation des conversations verrouillees

### Modules cibles
- `message_whatsapp/src/dispatcher`
- `message_whatsapp/src/whatsapp_message`
- `front/src/components/sidebar/ConversationList.tsx`
- `front/src/store/chatStore.ts`
- `admin`

### Dependances
- statut metier conversation
- criteres de completion definis

### Point d'attention
- la logique de verrouillage doit etre appliquee cote backend, pas uniquement cote front

---

## 5. Plan de livraison recommande

## Phase 1. Fondations de suivi client

Objectif:
- creer les bases metier sans casser l'existant

Inclus:
- dossier client enrichi
- statut metier de conversation
- relances
- portefeuille client
- historique interactionnel consolide

## Phase 2. Pilotage commercial

Objectif:
- rendre le systeme managable

Inclus:
- categorisation client
- ranking commerciaux
- objectifs
- temps de travail
- restriction de connexion

## Phase 3. Regles de capacite conversationnelle

Objectif:
- controler la charge et imposer le traitement progressif

Inclus:
- limite 50
- 10 conversations actives
- conversations grisees
- criteres de deblocage

## Phase 4. Fonctions avancees

Objectif:
- ajouter les briques de confort et de maturite

Inclus:
- IA de correction de texte
- certification client
- parrainage
- dashboard technique

---

## 6. Ordre de priorite recommande

## Priorite 1
- dossier client
- statuts de fin de conversation
- relances
- portefeuille client

## Priorite 2
- historique complet
- categorisation client
- integration des retours commandes dans la fiche client

## Priorite 3
- ranking commerciaux
- objectifs
- temps de travail
- restriction de connexion

## Priorite 4
- regles de verrouillage des conversations

## Priorite 5
- IA de correction
- certification
- parrainage
- monitoring technique

Remarque importante:
- metierement, la limitation de conversations est critique
- techniquement, elle est plus risquee a implementer
- il est donc plus prudent de preparer d'abord les statuts, criteres et bases de suivi avant de l'activer

---

## 7. Dependances transverses

Les fonctionnalites suivantes dependent fortement de l'integration avec la plateforme de gestion des commandes:
- categorisation client finale
- historique de commande
- historique de livraison
- certification client si externe
- parrainage

Les fonctionnalites suivantes peuvent demarrer sans attendre:
- dossier client conversationnel
- statuts metier conversation
- relances
- portefeuille
- ranking initial
- IA de correction
- limitation de charge conversationnelle

---

## 8. Risques d'implementation

## 8.1. Risque metier
- trop de logique laissee au front

## 8.2. Risque de doublon de donnees
- client / contact / conversation non unifies

## 8.3. Risque UX
- surcharge de l'interface commerciale

## 8.4. Risque de performance
- verrouillage dynamique des conversations
- filtres temps reel
- dashboards lourds

## 8.5. Risque d'incoherence
- si les webhooks de la plateforme de gestion ne sont pas encore stabilises

---

## 9. Recommandation finale

La plateforme conversationnelle est deja assez mature pour absorber les besoins de la reunion, mais il faut implementer les evolutions dans le bon ordre.

Le meilleur chemin est:
1. renforcer le modele de suivi client
2. rendre les conversations pilotables par des statuts metier
3. outiller les commerciaux avec relances et portefeuille
4. donner aux managers des indicateurs, objectifs et controles
5. appliquer ensuite les regles strictes de limitation de charge

Il ne faut pas commencer par les contraintes de verrouillage de conversations sans avoir d'abord:
- des statuts fiables
- des criteres de completion clairs
- une fiche client exploitable
- un systeme de relance coherent

Sinon la plateforme bloquera les commerciaux sans leur donner les outils pour bien traiter les clients.

