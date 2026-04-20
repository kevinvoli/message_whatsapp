# Rapport Complet de la Plateforme

Date: 20 avril 2026

Périmètre analysé:
- `message_whatsapp` : backend NestJS
- `admin` : panel d'administration / exploitation
- `front` : interface commerciale

Méthode:
- Analyse directe du code source, de l'arborescence, des modules, des vues UI, des entités, des contrôleurs et de la documentation interne.
- Comparaison externe avec des références officielles du marché consultées le 20 avril 2026: HubSpot, Intercom, Zendesk, Salesforce et Freshsales.

Limite volontaire:
- Ce rapport est un audit produit et architecture fondé sur le code et les écrans présents dans le dépôt. Il ne remplace pas une recette fonctionnelle en environnement de production ni une revue UX avec utilisateurs.

---

## 1. Résumé exécutif

La plateforme est déjà plus ambitieuse qu'une simple inbox WhatsApp. Elle possède plusieurs briques qu'on retrouve dans des solutions sérieuses du marché:
- routage et dispatch des conversations
- gestion de files d'attente
- multi-canal partiel
- temps réel via WebSocket
- automatisation de flux conversationnels
- SLA
- audit
- RBAC
- templates et broadcasts
- enrichissement CRM léger
- observabilité et alerting

Le point fort principal est donc la base opérationnelle. Le point faible principal est le modèle de suivi client, qui reste trop proche d'un "contact de conversation" enrichi, et pas d'un "dossier client vivant" tel qu'on l'attend dans une banque, une assurance, une fintech mature ou un service relationnel à forte traçabilité.

En pratique, la plateforme sait aujourd'hui:
- recevoir, router, traiter et suivre des conversations
- gérer des agents, des postes, des files d'attente et des canaux
- fournir des vues admin utiles pour l'exploitation
- stocker quelques données de contact, d'appel et de conversion

Mais elle ne sait pas encore suffisamment:
- construire une vue client 360 robuste
- piloter un portefeuille client
- gérer des dossiers / cas / incidents / demandes formalisées
- suivre des engagements, échéances, documents, obligations et validations
- produire un historique relationnel exploitable comme "journal de relation client"
- orchestrer un vrai plan de suivi commercial et de relance multi-étapes
- relier la conversation à des produits, contrats, comptes, segments, risques et objectifs

Conclusion directe:

Cette plateforme n'est pas en retard sur la partie conversationnelle opérationnelle. En revanche, elle est encore incomplète sur la partie CRM relationnel profond. Pour atteindre un niveau "suivi client à la manière des banques", il faut faire évoluer le centre de gravité du produit:
- de la conversation vers le dossier client
- du statut d'appel vers le plan d'action relationnel
- de la fiche contact vers la relation client structurée
- de l'analytics opérationnel vers la gouvernance commerciale, risque et conformité

---

## 2. Ce que la plateforme offre aujourd'hui

## 2.1. Backend `message_whatsapp`

Le backend est la partie la plus riche du projet. Le fichier `message_whatsapp/src/app.module.ts` montre une base modulaire large, organisée par domaines.

### Capacités métier déjà visibles

#### 1. Ingestion et traitement conversationnel
- Réception de messages entrants via webhooks.
- Normalisation multi-provider.
- Persistance des messages, médias et conversations.
- Temps réel via Socket.IO.
- Sécurisation des webhooks, rate limiting, idempotence et gestion de dégradation.

Indices de code:
- `message_whatsapp/src/whapi`
- `message_whatsapp/src/webhooks`
- `message_whatsapp/src/ingress`
- `message_whatsapp/src/whatsapp_message`
- `message_whatsapp/src/realtime`

#### 2. Multi-canal et multi-provider
La plateforme ne se limite pas conceptuellement à WhatsApp. Le code montre des adaptateurs ou providers pour:
- Whapi
- Meta / WhatsApp Business
- Messenger
- Instagram
- Telegram

Indices de code:
- `message_whatsapp/src/channel/providers`
- `message_whatsapp/src/webhooks/adapters`
- `message_whatsapp/src/communication_whapi`

Cela positionne déjà le produit au-dessus d'un simple outil mono-canal.

#### 3. Dispatch, queue et affectation
Le module de dispatch est une vraie force:
- assignation automatique
- réutilisation d'agent quand pertinente
- files d'attente
- réinjection de conversations
- support de poste dédié par canal
- délais de première réponse
- gestion des conversations orphelines

Indices de code:
- `message_whatsapp/src/dispatcher/dispatcher.service.ts`
- `message_whatsapp/src/dispatcher/application/assign-conversation.use-case.ts`
- `message_whatsapp/src/dispatcher/domain/dispatch-policy.service.ts`

#### 4. Automatisation FlowBot
La documentation `FLOWBOT_DOCUMENTATION.md` montre une automatisation avancée:
- triggers sur événement
- noeuds conditionnels
- questions/réponses
- délais
- escalade vers agent
- A/B testing
- variables de session
- scopes par canal/provider
- sessions actives, monitoring, analytics

C'est une vraie brique de workflow conversationnel, très compétitive pour un produit interne.

Indices de code:
- `message_whatsapp/src/flowbot`
- `FLOWBOT_DOCUMENTATION.md`

#### 5. Gestion du contact et du call tracking
Le contact possède déjà:
- nom
- téléphone
- `chat_id`
- statut d'appel
- date du dernier appel
- prochaine date d'appel
- notes d'appel
- nombre d'appels
- total de messages
- statut de conversion
- source
- priorité

En plus, un historique d'appels est persisté via `call-log`.

Indices de code:
- `message_whatsapp/src/contact/entities/contact.entity.ts`
- `message_whatsapp/src/contact/contact.service.ts`
- `message_whatsapp/src/call-log`

#### 6. CRM léger et personnalisable
Il existe déjà un mini-CRM:
- définitions de champs personnalisés par tenant
- valeurs CRM par contact
- lecture/écriture admin et agent

Indices de code:
- `message_whatsapp/src/crm/crm.service.ts`
- `message_whatsapp/src/crm/crm.controller.ts`

#### 7. Gouvernance et exploitation
La plateforme a des fondations sérieuses:
- journal d'audit
- rôles et permissions
- SLA
- notifications
- configuration système
- alertes système
- crons configurables
- observabilité documentaire

Indices de code:
- `message_whatsapp/src/audit`
- `message_whatsapp/src/rbac`
- `message_whatsapp/src/sla`
- `message_whatsapp/src/system-alert`
- `message_whatsapp/src/system-config`
- `message_whatsapp/src/jorbs`
- `docs/observability`

#### 8. Outbound avancé
Le produit gère aussi:
- templates WhatsApp
- broadcasts par lots
- webhooks sortants signés avec retry

Indices de code:
- `message_whatsapp/src/whatsapp-template`
- `message_whatsapp/src/broadcast`
- `message_whatsapp/src/outbound-webhook`

#### 9. IA et enrichissement
Il existe déjà:
- analyse de sentiment sur messages
- assistant IA de suggestion/résumé

Indices de code:
- `message_whatsapp/src/sentiment`
- `message_whatsapp/src/ai-assistant`

### Diagnostic backend

Le backend n'est pas le problème principal de la plateforme. Il est même plutôt avancé sur la couche conversationnelle et opérationnelle. Le vrai manque est au niveau du modèle métier client, pas au niveau des capacités d'acheminement et d'automatisation.

---

## 2.2. Admin `admin`

L'admin est orienté pilotage, configuration et exploitation. Le routeur principal `admin/src/app/dashboard/commercial/page.tsx` expose un nombre important de vues.

### Ce que l'admin couvre bien

#### 1. Pilotage opérationnel
- vue d'ensemble
- commerciaux
- postes
- performance
- conversations
- messages
- queue
- dispatch
- CRONs

#### 2. Configuration infrastructure
- canaux
- contextes
- observabilité
- GO/NO-GO
- paramètres

#### 3. Gouvernance
- règles SLA
- rôles et permissions
- audit logs
- webhooks sortants

#### 4. Marketing / diffusion
- broadcasts
- templates HSM

#### 5. CRM admin
- gestion des champs CRM personnalisés
- gestion des clients

### Ce que l'admin montre moins bien

L'admin est fort en "control tower", mais encore faible en "customer cockpit". Il est pensé pour:
- superviser l'usine conversationnelle
- gérer les ressources et les flux

Il est moins pensé pour:
- ouvrir un dossier client 360
- suivre les engagements relationnels
- piloter un portefeuille clients et ses risques
- suivre les étapes métier d'un client de bout en bout

### Point critique

La vue `ClientsView` ressemble aujourd'hui à une CRUD list de contacts administratifs:
- nom
- téléphone
- chat ID
- actif/inactif

Cela est utile, mais trop pauvre pour un usage bancaire ou relationnel avancé.

Indices de code:
- `admin/src/app/ui/ClientsView.tsx`

---

## 2.3. Front `front`

Le front commercial est orienté usage quotidien et conversation.

### Points forts

#### 1. Interface conversationnelle temps réel
- liste de conversations
- chat principal
- filtres
- unread
- actions de conversation
- WebSocket

#### 2. Outils d'agent utiles
- transfert
- merge de conversations
- labels
- réponses préenregistrées
- composition de messages
- support des médias

#### 3. Vue contact enrichie
La fiche contact expose déjà:
- timeline
- historique messages
- historique appels
- score d'engagement
- aperçu conversation
- médias partagés
- contacts similaires
- champs CRM dynamiques

Indices de code:
- `front/src/components/contacts/ContactDetailView.tsx`
- `front/src/lib/contactApi.ts`

### Limites importantes du front

#### 1. Les contacts sont dérivés des conversations chargées
Dans `front/src/app/contacts/page.tsx`, la liste des contacts est dérivée de `useChatStore().conversations.map(convToContact)`.

Conséquence:
- la vue contacts n'est pas un vrai registre CRM maître
- elle dépend du chargement des conversations
- elle risque d'être incomplète
- elle mélange logique conversationnelle et logique CRM

#### 2. Le score d'engagement est heuristique et local
Le score d'engagement du contact est calculé côté front à partir de règles simples:
- récence dernier appel
- nombre d'appels
- nombre de messages
- conversion

Conséquence:
- score non versionné
- non explicable métierment à un niveau gouvernance
- non persisté
- non industrialisé
- peu adapté à un environnement bancaire

#### 3. L'archivage n'est pas finalisé côté contact
On voit un `TODO` explicite sur l'archivage du contact dans `front/src/app/contacts/page.tsx`.

#### 4. La fiche contact reste centrée "activité de chat"
Elle est bonne pour un agent commercial léger, mais insuffisante pour un conseiller bancaire, un chargé de portefeuille, un analyste risque ou un superviseur conformité.

---

## 3. Forces majeures de la plateforme

## 3.1. Base produit déjà solide

Beaucoup de plateformes internes échouent avant d'atteindre ce niveau. Ici, la base existe déjà:
- modules séparés
- beaucoup de domaines métier
- test coverage partielle
- migrations
- multi-canal
- temps réel
- admin distinct
- front agent distinct

## 3.2. Très bonne capacité opérationnelle

Les briques qui coûtent cher à construire sont déjà là:
- orchestration des conversations
- affectation
- queue
- événements temps réel
- automatisation
- notifications
- analytics ops
- gouvernance

## 3.3. Bon potentiel d'évolution

La structure modulaire backend permet de faire évoluer la plateforme vers:
- CRM de relation
- case management
- conformité
- portefeuille client
- workflows métier de suivi

Sans devoir réécrire tout le socle conversationnel.

---

## 4. Faiblesses et limites actuelles

## 4.1. Le "client" n'est pas encore un vrai objet métier central

Le contact existe, mais il reste trop léger pour un suivi complet. Il manque une modélisation de:
- client
- compte
- foyer / groupe / entreprise
- portefeuille
- produits détenus
- contrats
- demandes
- incidents
- opportunités
- documents
- consentements
- pièces KYC
- niveau de risque
- segment commercial
- conseiller référent
- agence / zone / équipe propriétaire

Aujourd'hui, le contact ressemble davantage à un profil de conversation enrichi qu'à un dossier client.

## 4.2. Pas de "case management" structuré

Les solutions matures gèrent des cas ou dossiers:
- ouverture
- qualification
- priorité
- catégorisation
- SLA dédié
- pièces jointes
- étapes
- validation
- résolution
- réouverture

Dans votre plateforme, la conversation joue partiellement ce rôle, mais une conversation n'est pas un dossier métier.

## 4.3. Pas de moteur de tâches relationnelles robuste

Le besoin bancaire implique:
- tâches
- relances
- échéances
- rappels
- owners
- statuts
- preuves d'exécution
- escalades automatiques

Aujourd'hui, vous avez:
- statuts d'appel
- call logs
- prochaine date d'appel

Ce n'est pas suffisant pour un suivi relationnel structuré.

## 4.4. Pas de journal de relation client unifié

Ce qu'il faut viser:
- appels
- messages
- relances
- rendez-vous
- documents envoyés/reçus
- décisions
- validations
- changements de statut
- incidents
- promesses faites au client

Aujourd'hui, ces informations sont dispersées entre:
- messages
- call logs
- champs CRM
- notifications
- audit logs

Il manque un timeline métier unique.

## 4.5. Vision CRM encore trop paramétrique

Le CRM actuel est surtout:
- un schéma de champs personnalisés
- des valeurs attachées à un contact

Cela est utile, mais ce n'est pas encore:
- un cockpit relationnel
- une vue portefeuille
- une machine de suivi
- une vue banque / assurance

## 4.6. Duplication et confusion possible entre "Clients" et "Contacts"

Le produit porte plusieurs concepts proches:
- contact conversationnel
- client admin
- customer / contact CRM
- chat

Cette duplication risque de générer:
- ambiguïté métier
- incohérence de données
- UX confuse
- dette d'intégration

## 4.7. Présence de modules squelettiques ou hérités

Certains services semblent encore générés/stub:
- `message_whatsapp/src/whatsapp_contacts/whatsapp_contacts.service.ts`
- `message_whatsapp/src/whatsapp_customer/whatsapp_customer.service.ts`

Ils signalent une dette de structure. Ce n'est pas bloquant pour le produit, mais c'est un signal qu'il faut nettoyer le modèle.

## 4.8. Le scoring et l'intelligence sont encore peu industrialisés

L'IA et le scoring existent, mais restent "assistants":
- score d'engagement heuristique
- sentiment lexical simple
- assistant IA de suggestion/résumé

Ce sont de bonnes briques d'amorçage, mais pas encore des fonctions cœur de pilotage relationnel.

---

## 5. Comparaison avec des plateformes du même genre

Références officielles consultées:
- HubSpot Conversations / CRM
- Intercom Inbox + WhatsApp + Workflows
- Zendesk Agent Workspace + omnichannel routing
- Salesforce Customer 360 / Financial Services orientation
- Freshsales Customer 360 / workflows / tasks

## 5.1. Là où votre plateforme est compétitive

### 1. Orchestration conversationnelle interne
Votre plateforme est compétitive, voire supérieure à beaucoup d'outils maison, sur:
- dispatch des conversations
- affectation par poste
- logique de queue
- routage selon canal / poste dédié
- flux automatisés conversationnels

### 2. Contrôle opérationnel
Le panel admin couvre bien:
- files
- dispatch
- canaux
- observabilité
- crons
- métriques ops
- SLA
- audit

### 3. Personnalisation métier
Avec:
- FlowBot
- champs CRM custom
- rôles
- contexts
- webhooks sortants

le produit est plus personnalisable qu'une solution SaaS fermée standard.

## 5.2. Là où le marché est devant vous

### 1. Vue client 360
Les solutions comme Salesforce ou Freshsales mettent la donnée client au centre:
- historique multi-touchpoint
- activités
- contexte complet
- objets liés
- tâches
- propriétaires
- enrichissement

Votre plateforme a une base de vue contact, mais pas encore une vraie vue client 360 unifiée.

### 2. Inbox omnicanale mature
HubSpot, Intercom et Zendesk poussent plus loin:
- canaux unifiés dans une seule inbox
- contexte client riche directement dans l'espace agent
- routage, filtres, automatisations et règles fines
- continuité cross-channel plus aboutie

Votre produit a la fondation technique, mais l'expérience client/agent reste plus fragmentée.

### 3. Case management
Microsoft Dynamics Customer Service, Zendesk et Salesforce gèrent mieux:
- dossiers
- tickets/cases
- entitlements
- SLA par type de cas
- approbations
- side conversations
- objets liés

Votre produit reste aujourd'hui très conversation-first.

### 4. Suivi commercial et relationnel
Freshsales et HubSpot apportent nativement:
- tâches
- meetings
- pipelines
- owners
- workflows de relance
- next best action implicite via CRM

Votre produit couvre peu cette dimension.

### 5. Gouvernance bancaire / conformité
Les approches orientées services financiers vont plus loin sur:
- segmentation client
- hiérarchie relationnelle
- relation household / entreprise
- conformité
- KYC / documents
- consentements
- statuts réglementaires
- plans d'action et validations

Votre plateforme n'est pas encore à ce niveau.

---

## 6. Positionnement global par rapport au marché

Si on simplifie:

### Vous êtes déjà proches de:
- une plateforme conversationnelle interne avancée
- un dispatcher omnicanal avec supervision
- une inbox commerciale avec enrichissements CRM légers

### Vous n'êtes pas encore proches de:
- un CRM relationnel bancaire
- un case management institutionnel
- une plateforme Customer 360 de niveau enterprise

### Donc le vrai diagnostic est:
- bon moteur conversationnel
- CRM encore intermédiaire
- suivi client profond insuffisant

---

## 7. Diagnostic spécifique: pourquoi le suivi client n'est pas encore "complet"

Votre remarque de départ est juste. Le suivi client n'est pas complet parce que le modèle actuel suit surtout:
- une conversation
- un contact
- un appel

Alors qu'un suivi bancaire suit:
- une personne ou une entreprise
- ses comptes / produits / contrats
- son historique relationnel complet
- ses événements critiques
- ses pièces
- ses demandes formelles
- ses échéances
- ses engagements
- ses risques
- ses interactions avec plusieurs équipes
- ses décisions de traitement

Aujourd'hui, il manque notamment:

### 1. Une entité "Dossier client" ou "Case"
Pour représenter:
- réclamation
- demande de crédit
- ouverture de compte
- mise à jour KYC
- litige
- incident de paiement
- demande commerciale
- suivi VIP

### 2. Une entité "Tâche / Action de suivi"
Avec:
- owner
- priorité
- date d'échéance
- statut
- dépendances
- justification
- preuves

### 3. Une timeline relationnelle consolidée
Pas juste les messages. Toute l'histoire métier.

### 4. Une gestion documentaire
Pour:
- pièces d'identité
- justificatifs
- contrats
- formulaires
- consentements
- comptes rendus

### 5. Une gouvernance portefeuille
Le commercial ou conseiller doit savoir:
- quels clients il possède
- lesquels sont en retard de suivi
- lesquels sont à risque
- lesquels nécessitent une relance
- quels engagements tombent cette semaine

### 6. Une logique d'escalade métier
Exemples:
- client VIP sans réponse > 30 min
- document manquant > 48 h
- réclamation sensible > validation superviseur
- client à risque > revue conformité obligatoire

---

## 8. Ce qu'il faut garder absolument

Il ne faut surtout pas repartir de zéro. Les briques suivantes doivent être conservées et renforcées:

### 1. Le socle backend modulaire
Bonne base pour ajouter des domaines métier.

### 2. Le moteur de dispatch / queue
Très utile, différenciant, et déjà coûteux à refaire.

### 3. FlowBot
À garder et à faire évoluer vers des workflows de suivi client, pas seulement des bots conversationnels.

### 4. Le temps réel
Indispensable pour agents et supervision.

### 5. Les briques de gouvernance
- SLA
- audit
- RBAC
- alertes
- webhooks sortants

### 6. Les champs CRM dynamiques
Ils ne suffisent pas seuls, mais ils restent utiles comme couche d'extension.

### 7. L'historique d'appels
Base intéressante pour un suivi relationnel plus complet.

---

## 9. Ce qu'il faut améliorer fortement

## 9.1. Refondre le modèle métier autour de la relation client

Créer ou clarifier les objets suivants:
- `Customer` / `Client`
- `Account` / `Organisation` / `Household`
- `Case` / `Dossier`
- `Task` / `Action`
- `Document`
- `InteractionEvent`
- `RelationshipOwner`
- `ProductHolding`
- `RiskFlag`
- `Consent`

Le contact actuel peut devenir:
- soit un point d'entrée conversationnel
- soit une composante du client

Mais il ne doit plus être l'unique pivot.

## 9.2. Faire du front un vrai poste de suivi, pas seulement une fiche contact

La fiche doit devenir un cockpit client avec:
- résumé client
- alertes
- tâches à faire
- dossiers en cours
- documents manquants
- engagements
- conseiller référent
- portefeuille / segment / valeur
- timeline complète
- dernier motif de contact
- prochaine meilleure action

## 9.3. Ajouter un moteur de tâches et relances

Fonctions minimales:
- créer tâche
- attribuer à un owner
- échéance
- priorité
- rappel automatique
- récurrence
- statut
- lien vers client / dossier / canal
- déclenchement par workflow

## 9.4. Ajouter une vraie timeline métier unifiée

Le client doit avoir une chronologie unique incluant:
- message reçu
- message envoyé
- appel effectué
- note saisie
- document reçu
- document rejeté
- statut modifié
- tâche créée / clôturée
- dossier ouvert / résolu
- SLA dépassé
- escalade
- décision superviseur

## 9.5. Ajouter la gestion documentaire

Sans cela, impossible d'approcher un fonctionnement bancaire crédible.

À prévoir:
- types de documents
- statuts
- versioning
- pièces obligatoires
- date d'expiration
- validateur
- commentaires de contrôle

## 9.6. Renforcer l'analytics relationnel

Aujourd'hui l'analytics est surtout ops. Il faut ajouter:
- clients sans suivi depuis X jours
- clients VIP sans action
- dossiers bloqués
- taux de complétude KYC
- temps moyen de résolution par type de dossier
- taux de conversion par segment
- retards de relance
- churn / inactivité
- valeur portefeuille / productivité conseiller

---

## 10. Ce qu'il faut ajouter en priorité pour un suivi "à la manière des banques"

## Priorité 1: Dossier client 360

Créer une vue maître comprenant:
- identité client
- coordonnées
- segment
- statut relation
- propriétaire commercial
- agence / équipe
- produits liés
- risque
- SLA / entitlement
- documents
- cas en cours
- prochaines actions

## Priorité 2: Dossiers / cas

Exemples de types:
- onboarding
- réclamation
- demande d'information
- incident
- crédit
- mise à jour KYC
- renouvellement
- opportunité commerciale

Champs recommandés:
- type
- sous-type
- statut
- priorité
- owner
- date d'ouverture
- date cible
- date de clôture
- source
- canal d'origine
- pièces liées
- SLA
- niveau d'escalade

## Priorité 3: Tâches / actions de suivi

Sans tâches, le suivi n'est jamais complet.

Actions typiques:
- rappeler le client
- demander une pièce
- relancer souscripteur
- préparer rendez-vous
- valider un dossier
- escalader au superviseur
- recontacter après offre

## Priorité 4: Journal de relation

Construire un `InteractionEvent` unifié avec:
- type d'événement
- date/heure
- auteur
- canal
- entité liée
- commentaire
- payload métier

## Priorité 5: Moteur de suivi proactif

Workflows à créer:
- si client sans réponse 48 h -> créer tâche de relance
- si document manquant 72 h -> relance automatique + tâche conseiller
- si client VIP sans prise en charge -> alerte superviseur
- si dossier bloqué > SLA -> escalade
- si prochain appel arrive -> notification agent
- si client "chaud" sans action -> mise en file prioritaire

## Priorité 6: Modèle portefeuille

Par commercial / conseiller:
- portefeuille affecté
- charge de suivi
- clients à risque
- clients dormants
- opportunités ouvertes
- dossiers critiques

---

## 11. Ce qu'il faudrait supprimer, fusionner ou simplifier

## 11.1. Fusionner la notion de client/contact

Aujourd'hui, la séparation logique entre:
- contact
- client
- customer

n'est pas suffisamment nette. Il faut:
- choisir un objet maître
- définir les objets secondaires
- documenter les responsabilités de chacun

Recommandation:
- `Customer` ou `Client` comme objet maître
- `ConversationContact` ou `ConversationIdentity` comme objet de liaison si nécessaire

## 11.2. Supprimer ou isoler les modules squelettiques

Les modules non implémentés ou purement générés doivent être:
- supprimés si inutiles
- ou clairement marqués comme non actifs

Exemples:
- `whatsapp_contacts`
- `whatsapp_customer`

## 11.3. Réduire les signaux UX trop "légers" pour une cible banque

Exemple:
- score d'engagement coloré et très marketing
- labels visuels très grand public

À remplacer progressivement par:
- score de suivi
- score de risque relationnel
- score d'opportunité
- score d'urgence

avec règles explicables.

## 11.4. Éviter de faire du CRM uniquement avec des champs custom

Les champs custom sont utiles, mais ils ne doivent pas masquer l'absence d'un vrai modèle métier. Il faut éviter de transformer tout besoin en champ libre.

---

## 12. Feuille de route recommandée

## Phase 1: 0 à 6 semaines

Objectif: fermer les trous critiques sans casser l'existant.

À faire:
- clarifier le modèle `Client` vs `Contact`
- créer une table `task` de suivi
- créer une table `interaction_event`
- ajouter un owner commercial/conseiller au client
- exposer une liste de clients indépendante des conversations chargées
- finaliser l'archivage / fermeture cohérente
- introduire "prochaine action" et "date prochaine action"
- ajouter dashboard "clients sans suivi"

Impact:
- amélioration immédiate du suivi opérationnel
- faible risque architectural

## Phase 2: 2 à 3 mois

Objectif: installer la vraie mécanique de suivi client.

À faire:
- créer `case/dossier`
- lier messages, appels, documents, tâches et notes au dossier
- créer timeline unifiée
- créer workflows de relance automatique
- introduire SLA par type de dossier
- enrichir la fiche client avec portefeuille, dossiers, tâches, alertes

Impact:
- passage d'une plateforme conversationnelle à une plateforme relationnelle

## Phase 3: 3 à 6 mois

Objectif: atteindre un niveau banque/assurance crédible.

À faire:
- module documentaire
- module conformité / KYC
- segmentation client
- statut de risque
- validations superviseur
- règles VIP / priorisation
- tableaux de bord portefeuille
- scoring explicable persisté côté backend

## Phase 4: 6 à 12 mois

Objectif: industrialiser la relation client.

À faire:
- moteur "next best action"
- recommandations IA supervisées
- parcours client par segment
- supervision managériale avancée
- data quality / déduplication / master data
- intégration cœur métier / core banking / ERP / CRM externe

---

## 13. Recommandations produit concrètes

## 13.1. Nouvelle structure de la fiche client

La fiche client idéale devrait comporter:

### Bloc 1. Résumé
- identité
- segment
- propriétaire
- niveau de risque
- valeur client
- statut relation

### Bloc 2. Actions immédiates
- tâches dues aujourd'hui
- relances en retard
- prochaine action recommandée
- documents manquants

### Bloc 3. Dossiers
- dossiers ouverts
- priorité
- SLA
- blocages

### Bloc 4. Timeline relationnelle
- messages
- appels
- notes
- tâches
- documents
- décisions
- changements de statut

### Bloc 5. Produits / contrats
- produits détenus
- demandes en cours
- échéances

### Bloc 6. Conformité
- KYC
- consentements
- pièces expirantes
- contrôles en attente

## 13.2. Tableau de bord conseiller

Le commercial doit voir:
- mon portefeuille
- mes clients à relancer
- mes dossiers bloqués
- mes échéances aujourd'hui
- mes clients VIP non traités
- mes opportunités chaudes

## 13.3. Tableau de bord superviseur

Le manager doit voir:
- SLA en risque
- dossiers critiques
- clients sensibles
- retards par conseiller
- qualité de suivi
- dossiers sans owner

---

## 14. Recommandations techniques

## 14.1. Créer un vrai domaine `customer`

Aujourd'hui, la logique client est répartie entre plusieurs modules. Il faut centraliser:
- identité
- ownership
- segmentation
- relation
- portefeuille

## 14.2. Créer un domaine `case-management`

Ce domaine deviendra central pour un usage banque.

## 14.3. Créer un domaine `task-management`

Simple au départ, mais indispensable.

## 14.4. Créer un domaine `document`

Même si le stockage physique est externe, il faut au moins:
- métadonnées
- statuts
- échéances
- validateur

## 14.5. Déplacer les scores métier vers le backend

Le score d'engagement et futurs scores doivent être:
- calculés côté backend
- persistés
- versionnés
- auditables
- explicables

## 14.6. Séparer clairement analytics ops et analytics relationnels

Deux familles:
- analytics opérationnels: messages, volumes, files, réponse, affectation
- analytics relationnels: portefeuille, suivi, dossiers, qualité, fidélisation, risque

---

## 15. Risques si rien n'est fait

Si la plateforme reste en l'état, les risques sont:

### 1. Risque métier
Les commerciaux auront des conversations, mais pas un vrai pilotage client.

### 2. Risque de perte de suivi
Les relances dépendront encore trop de la mémoire humaine.

### 3. Risque de duplication
Les informations importantes partiront dans:
- notes libres
- champs custom
- fichiers externes
- WhatsApp lui-même

### 4. Risque de non-scalabilité managériale
Plus l'équipe grandit, plus il devient difficile de contrôler:
- qui doit faire quoi
- quel client est en retard
- quel dossier est bloqué

### 5. Risque de non-conformité future
Sans journal relationnel, tâches, documents et gouvernance, il devient difficile d'opérer proprement dans un contexte proche banque / assurance / finance.

---

## 16. Verdict global

### Niveau actuel
La plateforme est solide comme moteur conversationnel et outil de pilotage opérationnel.

### Niveau CRM actuel
Intermédiaire.

### Niveau suivi client actuel
Insuffisant pour un usage "type banque".

### Potentiel
Élevé, parce que le socle technique existe déjà.

### Décision stratégique recommandée
Ne pas refaire la plateforme.

Faire évoluer la plateforme selon une logique:
- conversation-first vers customer-first
- contact management vers relationship management
- inbox augmentée vers plateforme de suivi client

---

## 17. Plan d'action synthétique

À conserver:
- backend modulaire
- dispatch / queue
- FlowBot
- SLA / audit / RBAC
- multi-canal
- temps réel

À améliorer:
- modèle client
- fiche client
- analytics relationnels
- workflows de suivi
- qualité de donnée

À ajouter:
- dossier / case
- tâches
- timeline unifiée
- documents
- portefeuille
- conformité / KYC
- scoring explicable

À supprimer ou rationaliser:
- doublons client/contact non clarifiés
- services squelettiques non utilisés
- logique CRM trop dépendante de champs libres
- éléments UX de scoring trop "grand public" pour une cible banque

---

## 18. Sources de benchmark marché

Sources officielles consultées le 20 avril 2026:

- HubSpot Conversations Inbox:
  - https://www.hubspot.com/products/crm/conversations
  - https://knowledge.hubspot.com/inbox/use-the-conversations-inbox

- Intercom WhatsApp / Inbox / Workflows:
  - https://www.intercom.com/help/en/articles/5454490-connect-your-whatsapp-channel
  - https://www.intercom.com/help/en/articles/6808174-start-a-whatsapp-conversation
  - https://www.intercom.com/help/en/articles/9881317-use-your-whatsapp-business-number-in-workflows
  - https://www.intercom.com/help/en/articles/9955432-channels-explained

- Zendesk Agent Workspace / Omnichannel:
  - https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace
  - https://support.zendesk.com/hc/en-us/articles/4408821905434-Agent-Workspace-for-messaging
  - https://support.zendesk.com/hc/en-us/articles/5133523363226-About-unified-agent-statuses

- Salesforce Customer 360:
  - https://www.salesforce.com/data/360-customer-view/

- Freshsales Customer 360 / CRM workflows:
  - https://www.freshworks.com/crm/features/
  - https://crmsupport.freshworks.com/support/solutions/articles/50000009061-how-to-get-a-360-degree-view-of-customers-contacts-module-
  - https://crmsupport.freshworks.com/support/solutions/articles/50000002142-common-use-cases-for-workflows

- Microsoft Dynamics 365 Customer Service:
  - https://learn.microsoft.com/en-us/dynamics365/customer-service/administer/overview-cases
  - https://learn.microsoft.com/en-us/dynamics365/customer-service/use/overview-service-level-agreements
  - https://learn.microsoft.com/en-us/dynamics365/customer-insights/journeys/timeline

---

## 19. Conclusion finale

Votre plateforme est déjà une très bonne base de messagerie commerciale et d'orchestration conversationnelle.

Elle ne souffre pas d'un manque de modules techniques. Elle souffre surtout d'un manque de centralité du client comme objet métier.

La bonne stratégie n'est pas "ajouter quelques champs de plus".

La bonne stratégie est:
- créer un vrai modèle de suivi client
- structurer les dossiers et tâches
- centraliser la relation dans une timeline métier
- faire du front commercial un cockpit de portefeuille
- conserver le moteur conversationnel actuel comme couche d'exécution

Si cette évolution est menée proprement, la plateforme peut devenir:
- non seulement un outil WhatsApp performant
- mais un véritable système de gestion de relation client orienté suivi, conformité, engagement et performance.

