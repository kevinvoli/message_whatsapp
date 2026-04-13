# Rapport d'analyse du code et de l'architecture

Date: 2026-04-13

## 1. Résumé exécutif

Le dépôt est un monorepo orienté messagerie omnicanale, structuré autour de trois applications principales :

- `message_whatsapp`: backend NestJS central, cœur métier du dispatch, des webhooks, de l'authentification, des métriques et des automatisations.
- `front`: interface opérateur/commercial en Next.js pour le traitement temps réel des conversations.
- `admin`: interface d'administration en Next.js pour le pilotage, la configuration, l'observabilité et les opérations.

L'architecture générale est cohérente avec le besoin métier : un backend unique concentre l'intégration fournisseurs, la persistance MySQL, la diffusion temps réel via WebSocket et les règles métier de dispatch/auto-message. Les deux frontends consomment ce backend via HTTP et Socket.IO.

Le projet a toutefois dépassé le stade d'une application simple. Le backend contient désormais beaucoup de responsabilités dans un même service ou module, avec plusieurs "points névralgiques" très volumineux. Cela crée un risque élevé de régression, de couplage fort et de difficulté de maintenance.

En synthèse :

- L'architecture fonctionnelle est bonne.
- L'architecture modulaire NestJS est présente, mais inégalement appliquée.
- Le système temps réel est riche et bien pensé métier.
- Le principal problème n'est pas l'absence d'architecture, mais la concentration excessive de logique dans quelques fichiers/services.

## 2. Cartographie du dépôt

### 2.1 Racine

La racine contient :

- un `package.json` monorepo minimal avec scripts d'orchestration ;
- plusieurs documents `.md` d'audit, CDC, plans et rapports ;
- `docker-compose.yml` et `docker-compose.local.yml` ;
- les trois sous-projets applicatifs.

Le monorepo n'utilise pas d'outil de workspace avancé type Nx, Turborepo ou pnpm workspaces. La coordination se fait via des scripts `npm --prefix`. C'est simple, mais cela limite :

- la factorisation des types partagés ;
- les contrôles transverses ;
- le caching de build/test ;
- la réutilisation propre de librairies communes.

### 2.2 Applications

#### Backend `message_whatsapp`

Stack observée :

- NestJS 11
- TypeORM
- MySQL
- Socket.IO
- Joi pour la validation d'environnement
- `@nestjs/schedule` pour les jobs/cron

#### Front opérateur `front`

Stack observée :

- Next.js 16
- React 19
- Zustand
- Socket.IO client
- Axios

#### Front admin `admin`

Stack observée :

- Next.js 16
- React 19
- fetch natif
- composants UI maison
- export XLSX / PDF
- graphiques Recharts

## 3. Architecture fonctionnelle globale

### 3.1 Vision d'ensemble

Le système suit globalement ce flux :

1. Un fournisseur externe envoie un webhook.
2. Le backend normalise le payload via un adapter provider.
3. Le message est injecté dans un flux unifié.
4. Le dispatcher décide de l'affectation de la conversation.
5. Le message et les artefacts associés sont persistés.
6. Le backend émet des événements temps réel vers les rooms Socket.IO concernées.
7. Le front opérateur et le backoffice admin se synchronisent en quasi temps réel.

Cette chaîne est globalement saine et correspond à une architecture backend-centric robuste.

### 3.2 Capabilités métier principales

Les responsabilités métier couvertes sont nombreuses :

- réception omnicanale : Whapi, Meta, Messenger, Instagram, Telegram ;
- routage entrant unifié ;
- dispatch vers poste/commercial ;
- gestion de file d'attente ;
- réinjection SLA ;
- auto-messages événementiels et par cron ;
- canaux dédiés ou pool global ;
- métriques et snapshots ;
- notifications admin ;
- auth commercial et auth admin ;
- gestion des contacts, postes, channels, messages, médias, logs d'appel.

Le périmètre est large, ce qui explique la taille actuelle du code.

## 4. Analyse du backend `message_whatsapp`

### 4.1 Structure modulaire

`AppModule` assemble un grand nombre de modules métier :

- `DispatcherModule`
- `WhapiModule`
- `ChannelModule`
- `MessageAutoModule`
- `JorbsModule`
- `MetriquesModule`
- `NotificationModule`
- `SystemConfigModule`
- `SystemAlertModule`
- modules CRUD historiques autour des entités WhatsApp

Point positif :

- le backend est bien découpé par domaines métier apparents ;
- la configuration d'environnement est validée au boot ;
- la base de données est centralisée via un `DatabaseModule`.

Point de fragilité :

- plusieurs modules injectent directement trop de services voisins ;
- certaines responsabilités sont exposées transversalement au lieu d'être encapsulées ;
- la frontière entre "module métier", "module technique" et "module orchestration" n'est pas toujours nette.

### 4.2 Démarrage et configuration

Le `main.ts` met en place :

- `rawBody: true` pour les webhooks signés ;
- `ValidationPipe` globale ;
- cookies ;
- CORS piloté par variable d'environnement ;
- création/garantie d'un admin au démarrage ;
- exposition d'assets statiques pour les uploads.

C'est une base solide. Deux remarques toutefois :

- la configuration CORS est fonctionnelle, mais la logique reste en dur dans `main.ts` au lieu d'être encapsulée dans un module/config service ;
- le bootstrap mélange préoccupation HTTP, sécurité, fichiers statiques et bootstrap métier.

### 4.3 Base de données

Le `DatabaseModule` montre une configuration MySQL pragmatique :

- pool de connexions ;
- retry ;
- `autoLoadEntities` ;
- `synchronize` désactivable via variable ;
- nombreuses migrations datées.

Points positifs :

- existence de migrations nombreuses et récentes ;
- prise en compte de la performance via index et migrations d'optimisation ;
- présence d'une trajectoire multi-tenant visible dans les migrations.

Risques :

- `autoLoadEntities: true` simplifie le boot mais rend la lisibilité du graphe de persistance plus diffuse ;
- le nombre d'entités historiques suggère une base devenue très centrale, avec risque de surcharge relationnelle ;
- l'extension progressive du schéma laisse penser à une évolution continue sans refonte de domaine explicite.

### 4.4 Ingress omnicanal et normalisation

Le couple `UnifiedIngressService` + registry d'adapters est un des meilleurs points de l'architecture.

Forces :

- séparation claire entre payload fournisseur et format unifié ;
- pipeline d'ingestion homogène ;
- possibilité d'ajouter un provider sans contaminer toute la logique métier ;
- mode shadow pour comparer ou observer sans impacter le flux principal.

`InboundMessageService` centralise ensuite le traitement entrant :

- validation des `chat_id` ;
- résolution de nom ;
- affectation via dispatcher ;
- sauvegarde du message ;
- gestion des médias ;
- mise à jour de conversation ;
- émission websocket ;
- déclenchement éventuel des auto-messages.

C'est une brique très importante, mais déjà trop dense. Elle fait à la fois :

- orchestration technique ;
- contrôle de cohérence ;
- persistance ;
- enrichissement ;
- publication temps réel ;
- appel à l'automatisation.

Conclusion :

- le design macro est bon ;
- l'implémentation gagnerait à être fragmentée en pipeline explicite par étapes.

### 4.5 Dispatch et file d'attente

Le dispatch est au cœur du produit. `DispatcherService` concentre la logique d'affectation, de réaffectation, de SLA et d'état conversationnel.

Forces observées :

- verrous par conversation via `async-mutex` ;
- prise en compte des canaux dédiés ;
- gestion du mode online/offline ;
- traitement des conversations orphelines ;
- mécanismes de réinjection SLA ;
- snapshots de dispatch ;
- notifications associées.

C'est une logique métier riche et vraisemblablement critique pour la valeur du produit.

Faiblesses :

- service très volumineux ;
- mélange de règles métier, orchestration, notifications et side effects Socket ;
- forte dépendance au `WhatsappMessageGateway` ;
- grand nombre de branches conditionnelles, donc coût élevé pour tester et faire évoluer.

Constat important :

Le dispatch existe comme domaine métier, mais il n'est pas encore modélisé comme un sous-système autonome. Aujourd'hui il repose surtout sur un très gros service.

### 4.6 Couche temps réel

`WhatsappMessageGateway` est probablement le fichier le plus critique et le plus exposé au risque de complexité.

Le gateway gère :

- authentification socket ;
- rooms par tenant et poste ;
- connexion/déconnexion agent ;
- gestion de queue ;
- chargement conversations et messages ;
- throttling ;
- événements chat/contact/call log ;
- émission d'updates métier ;
- typing ;
- notifications d'assignation/réassignation/readonly ;
- mapping des payloads vers le frontend.

Points forts :

- très bon alignement avec les besoins temps réel ;
- rooms bien utilisées ;
- support multi-tenant ;
- pagination côté socket ;
- stratégie de batch pour certaines réassignations ;
- garde anti flood.

Faiblesses :

- beaucoup trop de responsabilités dans une seule classe ;
- mélange de transport WebSocket, auth, lecture DB, mapping DTO, logique métier et orchestration ;
- forte probabilité d'effets de bord lors de toute modification ;
- testabilité compliquée ;
- couplage fort avec `chatService`, `messageService`, `dispatcherService`, `queueService`, `contactService`, `notificationService`, etc.

Diagnostic :

Le gateway agit actuellement comme un mini-BFF temps réel + orchestrateur métier. C'est fonctionnel, mais dangereux à moyen terme.

### 4.7 Gestion des canaux

`ChannelService` est une autre pièce structurante. Il supporte plusieurs providers avec des logiques spécifiques :

- validation et création des canaux ;
- échange/refresh de tokens ;
- PAT Messenger ;
- webhook Telegram ;
- mapping provider/external_id/channel_id ;
- affectation de poste dédié ;
- résolution tenant.

Points positifs :

- le besoin multi-provider est bien pris en compte ;
- la persistance du mapping provider/tenant est une bonne décision ;
- la logique de sécurité webhook est prise en compte.

Point faible majeur :

- `ChannelService` est un service polymorphe qui encapsule trop de cas particuliers ;
- on observe une logique par provider dans de gros `if` successifs ;
- le design adapter est très bon côté inbound, mais moins poussé côté provisioning/admin des canaux.

Recommandation :

- appliquer le même niveau d'abstraction côté channel provisioning que côté ingress provider.

### 4.8 Automatisation et jobs

Le système d'auto-message est sophistiqué et couvre deux familles :

- orchestration événementielle immédiate ;
- orchestration centralisée par jobs/cron avec triggers multiples.

`AutoMessageOrchestrator` gère :

- verrous mémoire ;
- passage en `read_only` ;
- temporisation ;
- fenêtre 23h ;
- exécution de l'envoi ;
- déverrouillage.

`AutoMessageMasterJob` gère :

- triggers multiples ;
- prévisualisation ;
- garde-fous d'activation ;
- cohabitation avec l'orchestrateur événementiel ;
- filtres par scope, horaires et conditions métier.

Forces :

- modèle métier avancé ;
- vraie prise en compte de la concurrence et des doubles envois ;
- logique paramétrable ;
- architecture de cron configurable via `CronConfigService`.

Risques :

- très forte complexité cognitive ;
- coexistence de plusieurs mécanismes d'automatisation potentiellement difficile à maintenir ;
- grand nombre de drapeaux d'état sur la conversation ;
- risque de bugs subtils lié aux timeouts mémoire + DB + websocket.

Le système semble puissant mais fragile. Il mérite une documentation d'état métier dédiée et des tests d'intégration plus massifs.

### 4.9 Authentification et sécurité

Deux couches d'auth sont présentes :

- auth commerciale ;
- auth admin.

Le design avec base abstraite (`BaseAuthService`) est bon. L'utilisation de cookies HTTP-only côté front est aussi une bonne décision.

À surveiller :

- la séparation exacte entre endpoints commerciaux et admin doit rester stricte ;
- le gateway socket repose partiellement sur le même modèle de jeton, ce qui impose une cohérence parfaite de la stratégie JWT ;
- plusieurs contrôleurs/services sensibles justifieraient une cartographie explicite des guards et rôles.

### 4.10 Observabilité et métriques

Le backend possède un effort réel sur l'observabilité :

- service de métriques ;
- métriques webhook ;
- snapshots analytics ;
- notifications admin ;
- health/alerting système ;
- logs applicatifs.

`MetriquesService` montre une attention claire aux performances SQL, avec commentaires utiles et agrégations optimisées.

C'est un point fort important : le projet ne se limite pas au fonctionnel, il intègre déjà des préoccupations d'exploitation.

## 5. Analyse du frontend opérateur `front`

### 5.1 Architecture

Le frontend commercial repose sur :

- `AuthProvider` pour la session ;
- `SocketProvider` pour la connexion temps réel ;
- `chatStore` Zustand comme source d'état principal ;
- composants dédiés pour sidebar, messages, chat, contacts.

Le flux global est clair :

- le user authentifié charge sa session ;
- le socket s'ouvre avec token/cookies ;
- le store charge conversations/messages via événements socket ;
- l'UI se met à jour selon les événements temps réel.

### 5.2 Points forts

- architecture simple à suivre ;
- séparation convenable entre providers, store et composants ;
- pagination de conversations et messages ;
- gestion optimiste de l'envoi ;
- logique métier de chat bien centrée dans `chatStore`.

### 5.3 Points de fragilité

`chatStore.ts` est déjà un store "gros cerveau". Il concentre :

- état global ;
- pagination ;
- logique d'unread ;
- déduplication ;
- optimistic UI ;
- gestion typing ;
- gestion de statuts ;
- logique de tri et fusion.

Ce n'est pas encore au niveau de criticité du backend, mais on voit le même pattern :

- une bonne centralisation initiale ;
- puis une accumulation progressive de règles.

Autres points :

- `SocketProvider` utilise `useMemo`, mais la logique de vie du socket reste simple et peu encapsulée ;
- le frontend dépend fortement de la structure exacte des événements gateway ;
- il existe probablement un couplage implicite fort entre shape backend et shape store.

## 6. Analyse du frontend admin `admin`

### 6.1 Positionnement

Le backoffice admin est large et piloté par un `viewMode` central. Il agrège :

- overview ;
- commerciaux ;
- postes ;
- queue ;
- dispatch ;
- canaux ;
- automessages ;
- conversations ;
- métriques ;
- notifications ;
- settings ;
- observabilité ;
- go/no-go.

Fonctionnellement, il semble très complet.

### 6.2 Forces

- couverture forte des opérations ;
- UI découpée en vues spécialisées ;
- usage d'un dashboard central ;
- exposition de fonctionnalités avancées d'exploitation ;
- présence de hooks dédiés pour notifications et health.

### 6.3 Fragilités

Le principal problème ici est `admin/src/app/lib/api.ts`.

Ce fichier est un "god file" d'accès API qui :

- connaît quasiment tous les endpoints ;
- centralise des dizaines de fonctions ;
- contient aussi des normalisations et types dérivés ;
- devient une surface de couplage massive avec le backend.

Conséquences :

- faible lisibilité ;
- faible évolutivité ;
- risque élevé de conflit de modification ;
- absence de découpage par domaine ;
- difficulté de test unitaire ciblé.

L'admin est donc fonctionnellement riche, mais techniquement un peu monolithique côté client.

## 7. Cohérence de l'architecture

### 7.1 Ce qui est cohérent

- un backend central unique pour les règles métier ;
- deux frontends spécialisés selon les usages ;
- une vraie architecture événementielle temps réel ;
- une ingestion multi-provider normalisée ;
- une base relationnelle qui reste le référentiel de vérité ;
- des jobs et de la config permettant l'opérationnalisation.

### 7.2 Ce qui est moins cohérent

- motifs d'abstraction appliqués de façon inégale selon les zones ;
- certains domaines sont modulaires, mais leur logique réelle reste tassée dans un seul gros service ;
- la couche transport WebSocket contient trop de métier ;
- les clients front et admin ont des points d'accès API trop centralisés ;
- l'absence de package partagé de types renforce le couplage implicite.

## 8. Points forts majeurs

### 8.1 Architecture métier réelle

Le système reflète un vrai produit métier. Ce n'est pas un CRUD banal. Le code implémente des règles opérationnelles réelles :

- distribution de charge ;
- SLA ;
- lecture/non lecture ;
- modes online/offline ;
- canaux dédiés ;
- campagnes auto-message conditionnelles.

### 8.2 Prise en compte du temps réel

Le temps réel n'est pas cosmétique. Il structure le produit, et l'architecture le traite comme un premier citoyen.

### 8.3 Maturité opérationnelle

Les modules d'observabilité, métriques, notifications, alerting et configuration montrent une maturité supérieure à celle d'un prototype.

### 8.4 Évolution continue du schéma

Le nombre de migrations et d'optimisations SQL indique une vraie vie du produit et un souci d'amélioration continue.

## 9. Faiblesses majeures

### 9.1 Complexité concentrée

Plusieurs fichiers sont devenus des goulots de complexité :

- `dispatcher.service.ts`
- `whatsapp_message.gateway.ts`
- `channel.service.ts`
- `inbound-message.service.ts`
- `auto-message-master.job.ts`
- `admin/src/app/lib/api.ts`
- `front/src/store/chatStore.ts`

Le risque principal du projet est ici.

### 9.2 Couplage transversal fort

Le backend repose encore beaucoup sur des appels directs entre services, avec side effects multiples :

- DB
- gateway
- notifications
- auto-messages
- queue
- jobs

Cela rend les flux difficiles à raisonner de bout en bout.

### 9.3 Manque de frontières explicites

On distingue les modules, mais pas toujours les couches. Par exemple :

- application service ;
- domain service ;
- infrastructure service ;
- presenter/mapper ;
- policy/rule engine.

Beaucoup de classes combinent plusieurs de ces niveaux.

### 9.4 Risque de dette de test

Le dépôt contient des tests, mais vu la complexité observée, le risque est élevé que :

- les tests soient concentrés sur certains modules seulement ;
- les scénarios croisés soient sous-couverts ;
- les régressions métier surviennent aux interfaces entre modules.

### 9.5 Encodage et qualité de commentaire

Plusieurs fichiers affichent des caractères encodés incorrectement dans les sorties lues. Cela suggère :

- un problème d'encodage fichier ou terminal ;
- une base de code hétérogène ;
- une qualité de rendu qui peut gêner la maintenance documentaire.

## 10. Risques techniques prioritaires

### 10.1 Régression sur le dispatch

Le dispatch étant central et complexe, toute modification locale peut avoir des effets sur :

- attribution initiale ;
- canaux dédiés ;
- réinjection ;
- queue offline ;
- événements socket ;
- métriques.

### 10.2 Régression sur le temps réel

Le gateway concentre trop de logique. Un changement sur un event ou mapper peut casser :

- chargement initial ;
- unread counters ;
- typing ;
- transitions de conversation ;
- synchro front/admin.

### 10.3 Incohérences d'état conversationnel

Le modèle de conversation contient beaucoup de drapeaux et timestamps :

- `read_only`
- `status`
- `assigned_at`
- `assigned_mode`
- `first_response_deadline_at`
- `last_client_message_at`
- `last_poste_message_at`
- `auto_message_step`
- divers champs de triggers auto-message

Plus ce nombre augmente, plus le risque d'état impossible augmente.

### 10.4 Scalabilité de la maintenance

L'application peut probablement continuer à fonctionner ainsi à court terme, mais la vitesse d'évolution va chuter si la concentration de logique continue.

## 11. Recommandations

### 11.1 Priorité 1 : découper les gros services critiques

Refactorer en priorité :

- `WhatsappMessageGateway`
- `DispatcherService`
- `InboundMessageService`
- `ChannelService`

Approche recommandée :

- extraire les mappers/presenters ;
- extraire les policies/rules ;
- extraire les handlers de cas d'usage ;
- réduire les side effects dans chaque méthode.

Exemple de découpage pour le gateway :

- `socket-auth.service`
- `conversation-query.service`
- `conversation-event-publisher`
- `message-event-publisher`
- `socket-payload.mapper`
- `agent-connection.service`

### 11.2 Priorité 2 : formaliser les domaines métier

Les domaines à formaliser explicitement :

- Dispatch
- Ingress provider
- Conversation lifecycle
- Auto-message
- Channel provisioning
- Realtime delivery

Pour chacun :

- définir responsabilités ;
- définir entrées/sorties ;
- isoler les invariants métier ;
- limiter les dépendances croisées.

### 11.3 Priorité 3 : créer un package partagé de types

Le monorepo bénéficierait fortement d'un package commun, par exemple :

- `packages/shared-types`
- `packages/contracts`

À mutualiser :

- DTO communs ;
- types d'événements socket ;
- enums de statut ;
- formes de conversation/message/channel.

Cela réduira :

- la duplication ;
- les normalisations ad hoc côté front/admin ;
- les dérives silencieuses entre backend et clients.

### 11.4 Priorité 4 : découper les clients par domaine API

Refactorer :

- `admin/src/app/lib/api.ts`
- éventuellement le front HTTP/socket contract layer

Découpage recommandé :

- `api/channels.ts`
- `api/conversations.ts`
- `api/dispatch.ts`
- `api/metrics.ts`
- `api/notifications.ts`
- `api/system-config.ts`

### 11.5 Priorité 5 : renforcer les tests d'intégration métier

Cibler en priorité :

- webhook entrant -> dispatch -> persistance -> émission socket ;
- réassignation SLA ;
- canal dédié vs pool global ;
- auto-message orchestrateur ;
- auto-message master triggers ;
- changement de statut conversation ;
- reconnexion/déconnexion agent ;
- unread counters et synchro front.

### 11.6 Priorité 6 : documenter les états métier

Créer des documents dédiés pour :

- machine d'état conversation ;
- dispatch lifecycle ;
- auto-message lifecycle ;
- contrats d'événements Socket.IO ;
- modèle multi-tenant.

Le besoin de documentation est élevé car le système contient beaucoup de logique implicite.

## 12. Proposition de trajectoire de refonte

### Phase 1 : sécurisation

- cartographier les flux critiques ;
- ajouter tests d'intégration sur les scénarios cœur ;
- figer les contrats socket et API les plus sensibles.

### Phase 2 : découpage interne

- extraire mappers, query services et publishers ;
- réduire la taille des services critiques ;
- introduire des cas d'usage métier explicites.

### Phase 3 : mutualisation monorepo

- créer un package de types/contrats ;
- normaliser les DTO et événements partagés ;
- réduire les conversions côté clients.

### Phase 4 : hardening exploitation

- renforcer observabilité par flux ;
- tracer les corrélations webhook -> message -> chat -> socket ;
- standardiser logs et error handling.

## 13. Conclusion

Le projet est techniquement substantiel et fonctionnellement mature. L'architecture générale est pertinente : backend central, normalisation multi-provider, persistance relationnelle, temps réel et backoffice d'exploitation.

Le principal enjeu n'est pas de "repenser toute l'architecture", mais de reprendre le contrôle de la complexité déjà accumulée. Le système possède de bonnes fondations, mais plusieurs composants critiques sont devenus trop gros et trop couplés.

Le backend constitue clairement le centre de gravité du produit. Si vous investissez dans :

- le découpage des services critiques ;
- la formalisation des domaines ;
- les contrats partagés ;
- les tests d'intégration métier ;

alors le projet peut gagner nettement en stabilité, en vitesse d'évolution et en lisibilité sans rupture majeure d'architecture.

## 14. Synthèse courte

- Architecture globale : bonne.
- Architecture de code : correcte mais trop concentrée.
- Risque principal : complexité dans quelques gros services/fichiers.
- Priorité immédiate : refactor ciblé du dispatch, du gateway temps réel, de l'ingress et du client API admin.
- Potentiel du projet : élevé, à condition de traiter la dette structurelle maintenant.
