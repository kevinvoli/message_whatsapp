# Plan de restructuration du backend, du front et de l'admin

Date: 2026-04-13

## 1. Objectif

Ce plan a pour but de réduire la complexité actuelle du projet sans casser le produit en production ni ralentir durablement l'équipe.

Les objectifs sont :

- découper les gros fichiers et les services goulots ;
- clarifier les responsabilités de chaque module ;
- séparer la logique métier, la logique d'orchestration, la couche transport et la couche présentation ;
- réduire le couplage entre backend, front et admin ;
- rendre les évolutions plus sûres ;
- améliorer la testabilité et la lisibilité.

Ce plan est volontairement pragmatique :

- on ne refond pas tout d'un coup ;
- on restructure par zones critiques ;
- on garde les API et événements existants le plus longtemps possible ;
- on introduit les nouvelles couches avant de supprimer les anciennes.

## 2. Principes de restructuration

### 2.1 Règles générales

Chaque zone du projet devra converger vers cette logique :

- un module = un domaine fonctionnel identifiable ;
- un sous-module = une responsabilité technique ou métier bien bornée ;
- les services "god objects" doivent être éclatés en services spécialisés ;
- les DTO, mappers, policies, queries et handlers ne doivent plus vivre ensemble dans les mêmes fichiers ;
- la couche transport ne doit pas porter la logique métier ;
- les side effects doivent être explicites.

### 2.2 Règle de découpage

Pour chaque gros fichier, on appliquera ce schéma :

1. Extraire les types/DTO/mappers.
2. Extraire les lectures DB dans des query services.
3. Extraire les règles métier dans des policy/rule services.
4. Extraire les actions métier en use cases / application services.
5. Réduire le fichier initial à un point d'entrée d'orchestration.

### 2.3 Règle de migration

Pour éviter les régressions :

1. Encapsuler l'existant.
2. Ajouter les nouveaux services autour.
3. Rediriger progressivement les appels.
4. Garder les signatures publiques stables le temps de migrer les consommateurs.
5. Supprimer l'ancien code seulement quand les tests et flux réels sont couverts.

## 3. Vision cible du monorepo

### 3.1 Cible globale

Le monorepo doit évoluer vers 4 blocs :

- `message_whatsapp`: backend métier et temps réel
- `front`: poste opérateur
- `admin`: backoffice d'exploitation
- `packages/shared-contracts`: types, enums, contrats API et événements socket

### 3.2 Package partagé à créer

Créer un package commun de contrats, par exemple :

- `packages/shared-contracts`

Contenu cible :

- enums de statut conversation/message/channel ;
- types de conversation simplifiés ;
- types de payload Socket.IO ;
- DTO communs front/admin ;
- constantes de noms d'événements.

Bénéfices :

- réduction de la duplication ;
- moins de normalisations implicites ;
- alignement fort entre backend, front et admin.

## 4. Plan backend

## 4.1 Objectifs backend

Le backend doit être restructuré autour de domaines explicites :

- ingress omnicanal ;
- conversations ;
- dispatch ;
- realtime ;
- auto-messages ;
- channels ;
- auth ;
- observabilité ;
- configuration système.

Le but n'est pas de multiplier les modules artificiellement, mais d'isoler les responsabilités lourdes.

## 4.2 Architecture cible backend

### 4.2.1 Structure cible

Proposition de structure :

```text
message_whatsapp/src/
  core/
    config/
    logging/
    database/
    shared/
  modules/
    ingress/
      adapters/
      normalization/
      application/
      domain/
      infrastructure/
    conversations/
      application/
      domain/
      infrastructure/
      presentation/
    dispatch/
      application/
      domain/
      infrastructure/
      presentation/
    realtime/
      gateways/
      publishers/
      auth/
      mappers/
      subscriptions/
    automations/
      orchestrator/
      triggers/
      business-hours/
      scope/
      cron/
    channels/
      application/
      providers/
      domain/
      infrastructure/
      presentation/
    metrics/
    notifications/
    contacts/
    auth/
    admin-auth/
    system-config/
    system-alert/
```

### 4.2.2 Règle de couches backend

Dans chaque domaine critique :

- `domain/`: règles métier, enums métier, invariants ;
- `application/`: use cases, orchestrations métier ;
- `infrastructure/`: repository adapters, providers externes ;
- `presentation/`: controllers, gateway handlers, DTO transport ;
- `mappers/`: conversion entité -> DTO/payload.

## 4.3 Découpage prioritaire des goulots backend

### 4.3.1 `whatsapp_message.gateway.ts`

Problème :

- trop de responsabilités ;
- mélange auth socket, room management, query DB, mapping, orchestration et publication.

Découpage cible :

- `realtime/gateways/chat.gateway.ts`
- `realtime/auth/socket-auth.service.ts`
- `realtime/connections/agent-connection.service.ts`
- `realtime/subscriptions/conversation.subscription.ts`
- `realtime/subscriptions/contact.subscription.ts`
- `realtime/subscriptions/call-log.subscription.ts`
- `realtime/publishers/conversation.publisher.ts`
- `realtime/publishers/message.publisher.ts`
- `realtime/publishers/queue.publisher.ts`
- `realtime/mappers/socket-message.mapper.ts`
- `realtime/mappers/socket-conversation.mapper.ts`
- `realtime/queries/socket-conversation-query.service.ts`

Résultat attendu :

- le gateway ne garde que les handlers socket ;
- la logique métier et les accès DB sortent du gateway ;
- les publications d'événements deviennent testables isolément.

### 4.3.2 `dispatcher.service.ts`

Problème :

- service central trop volumineux ;
- logique d'affectation, SLA, réinjection et notifications au même endroit.

Découpage cible :

- `dispatch/application/assign-conversation.use-case.ts`
- `dispatch/application/reinject-conversation.use-case.ts`
- `dispatch/application/redispatch-waiting.use-case.ts`
- `dispatch/application/reset-stuck-active.use-case.ts`
- `dispatch/application/get-dispatch-snapshot.use-case.ts`
- `dispatch/domain/dispatch-policy.service.ts`
- `dispatch/domain/poste-resolution.service.ts`
- `dispatch/domain/sla-policy.service.ts`
- `dispatch/domain/channel-routing.policy.ts`
- `dispatch/infrastructure/dispatch-lock.service.ts`
- `dispatch/infrastructure/dispatch-query.service.ts`
- `dispatch/presentation/dispatch.mapper.ts`

Résultat attendu :

- chaque cas d'usage métier devient explicite ;
- les règles de dispatch sont réutilisables ;
- les notifications/socket deviennent des effets secondaires branchés autour du use case.

### 4.3.3 `inbound-message.service.ts`

Problème :

- pipeline entrant complet concentré dans un seul service.

Découpage cible :

- `ingress/application/process-incoming-message.use-case.ts`
- `ingress/application/process-status-update.use-case.ts`
- `ingress/domain/chat-id-validation.service.ts`
- `ingress/domain/media-extraction.service.ts`
- `ingress/domain/provider-enrichment.service.ts`
- `ingress/infrastructure/incoming-message-persistence.service.ts`
- `ingress/infrastructure/media-persistence.service.ts`
- `ingress/presentation/inbound.mapper.ts`

Pipeline cible :

1. validation
2. enrichissement provider
3. affectation conversation
4. persistance message
5. persistance médias
6. update conversation state
7. publication realtime
8. trigger automation

### 4.3.4 `channel.service.ts`

Problème :

- un seul service gère tous les providers et tous les cas.

Découpage cible :

- `channels/application/create-channel.use-case.ts`
- `channels/application/update-channel.use-case.ts`
- `channels/application/assign-channel-poste.use-case.ts`
- `channels/application/resolve-tenant.use-case.ts`
- `channels/providers/whapi-channel-provider.service.ts`
- `channels/providers/meta-channel-provider.service.ts`
- `channels/providers/messenger-channel-provider.service.ts`
- `channels/providers/instagram-channel-provider.service.ts`
- `channels/providers/telegram-channel-provider.service.ts`
- `channels/domain/channel-provider.registry.ts`
- `channels/domain/channel-security.policy.ts`
- `channels/infrastructure/provider-mapping.repository.ts`

Résultat attendu :

- même niveau de modularité que l'ingress provider ;
- suppression des gros `if` provider dans un service unique.

### 4.3.5 `auto-message-master.job.ts`

Problème :

- trop de triggers dans une seule classe ;
- forte densité métier.

Découpage cible :

- `automations/cron/auto-message-master.job.ts`
- `automations/triggers/no-response.trigger.ts`
- `automations/triggers/out-of-hours.trigger.ts`
- `automations/triggers/reopened.trigger.ts`
- `automations/triggers/queue-wait.trigger.ts`
- `automations/triggers/keyword.trigger.ts`
- `automations/triggers/client-type.trigger.ts`
- `automations/triggers/inactivity.trigger.ts`
- `automations/triggers/on-assign.trigger.ts`
- `automations/triggers/trigger-runner.service.ts`
- `automations/triggers/trigger-preview.service.ts`

Résultat attendu :

- chaque trigger devient un module testable ;
- la classe master devient un orchestrateur de déclenchement seulement.

## 4.4 Modules backend à stabiliser

### 4.4.1 Conversations

Créer ou clarifier un vrai domaine `conversations` :

- lecture conversation ;
- transition d'état ;
- readonly ;
- unread counters ;
- timeline métier ;
- machine d'état.

Sous-modules cibles :

- `conversations/application`
- `conversations/domain`
- `conversations/infrastructure`
- `conversations/presentation`

### 4.4.2 Realtime

Faire de `realtime` un domaine technique séparé :

- gateway handlers ;
- room management ;
- publication ;
- payload contracts ;
- auth socket.

### 4.4.3 Automations

Unifier :

- orchestrateur événementiel ;
- cron master ;
- business hours ;
- scope config ;
- state transitions auto-message.

### 4.4.4 Observabilité

Rassembler :

- métriques ;
- health ;
- notifications ;
- webhook metrics ;
- trace/log correlation.

## 4.5 Ordre d'exécution backend

### Étape B1

- créer `packages/shared-contracts`
- extraire les enums et contrats temps réel

### Étape B2

- extraire mappers et query services du gateway
- garder le gateway existant comme façade

### Étape B3

- découper `DispatcherService` en use cases
- maintenir l'API publique existante

### Étape B4

- découper `InboundMessageService`
- transformer le flux entrant en pipeline explicite

### Étape B5

- découper `ChannelService` par provider

### Étape B6

- découper `AutoMessageMasterJob` par trigger

### Étape B7

- formaliser le module `conversations`

## 5. Plan front opérateur

## 5.1 Objectifs front

Le front doit devenir plus lisible, avec une séparation claire entre :

- session/auth ;
- transport socket ;
- store métier ;
- composants UI ;
- accès API ;
- mapping des payloads.

## 5.2 Structure cible front

```text
front/src/
  app/
  modules/
    auth/
    chat/
    conversations/
    contacts/
    realtime/
  shared/
    api/
    socket/
    stores/
    mappers/
    utils/
  components/
```

Alternative plus stricte :

- migrer progressivement les composants actuels dans `modules/*`.

## 5.3 Découpage prioritaire front

### 5.3.1 `store/chatStore.ts`

Problème :

- trop de logique dans un seul store ;
- mélange conversations, messages, typing, pagination, optimistic UI.

Découpage cible :

- `modules/chat/store/message.store.ts`
- `modules/conversations/store/conversation.store.ts`
- `modules/realtime/store/socket-session.store.ts`
- `modules/chat/services/message-optimistic.service.ts`
- `modules/conversations/services/conversation-merge.service.ts`
- `modules/conversations/services/unread-counter.service.ts`
- `modules/chat/mappers/message.mapper.ts`
- `modules/conversations/mappers/conversation.mapper.ts`

Résultat attendu :

- un store par responsabilité ;
- une logique de fusion externalisée ;
- moins de couplage au format backend brut.

### 5.3.2 `SocketProvider.tsx`

Découpage cible :

- `modules/realtime/providers/SocketProvider.tsx`
- `modules/realtime/services/socket-connection.service.ts`
- `modules/realtime/services/socket-event-router.service.ts`
- `modules/realtime/contracts/events.ts`

Résultat attendu :

- séparation entre cycle de vie socket et dispatch des événements reçus.

### 5.3.3 `AuthProvider.tsx`

Découpage cible :

- `modules/auth/providers/AuthProvider.tsx`
- `modules/auth/api/auth.api.ts`
- `modules/auth/mappers/auth.mapper.ts`
- `modules/auth/session/session.service.ts`

### 5.3.4 Page WhatsApp et composants chat

La page `whatsapp/page.tsx` doit rester une page de composition.

Extractions recommandées :

- `modules/chat/containers/ChatWorkspace.tsx`
- `modules/conversations/containers/ConversationSidebar.tsx`
- `modules/contacts/containers/ContactWorkspace.tsx`
- hooks dédiés par vue :
  - `useConversationSearch`
  - `useConversationFilters`
  - `useConversationSelection`

## 5.4 Contrat cible front/backend

Le front ne doit plus dépendre directement des payloads "bruts" du gateway.

Créer une couche de mapping :

- payload socket backend -> modèle UI ;
- DTO HTTP backend -> modèle front ;
- événements front -> commandes structurées.

## 5.5 Ordre d'exécution front

### Étape F1

- introduire `shared-contracts`
- brancher les types socket communs

### Étape F2

- extraire mappers de conversation/message

### Étape F3

- scinder `chatStore` en sous-stores

### Étape F4

- sortir la logique socket dans un routeur d'événements

### Étape F5

- refactorer la page `whatsapp` en containers métier

## 6. Plan admin

## 6.1 Objectifs admin

L'admin doit être transformé d'un client "centralisé par vue et gros fichier API" vers un client structuré par domaine.

Objectifs :

- découper l'accès API ;
- isoler les vues par domaine ;
- réduire la dépendance à un fichier unique ;
- mieux aligner les types avec le backend.

## 6.2 Structure cible admin

```text
admin/src/
  app/
  modules/
    overview/
    commerciaux/
    postes/
    channels/
    conversations/
    dispatch/
    automations/
    observability/
    notifications/
    settings/
  shared/
    api/
    hooks/
    mappers/
    ui/
    contracts/
```

## 6.3 Découpage prioritaire admin

### 6.3.1 `app/lib/api.ts`

Problème :

- fichier monolithique de communication backend.

Découpage cible :

- `shared/api/auth.api.ts`
- `shared/api/channels.api.ts`
- `shared/api/conversations.api.ts`
- `shared/api/dispatch.api.ts`
- `shared/api/metrics.api.ts`
- `shared/api/notifications.api.ts`
- `shared/api/system-config.api.ts`
- `shared/api/automations.api.ts`
- `shared/api/postes.api.ts`
- `shared/api/commerciaux.api.ts`
- `shared/api/clients.api.ts`

Extractions complémentaires :

- `shared/mappers/chat.mapper.ts`
- `shared/mappers/channel.mapper.ts`
- `shared/mappers/metrics.mapper.ts`
- `shared/contracts/*.ts`

### 6.3.2 `dashboard/commercial/page.tsx`

Cette page joue aujourd'hui le rôle de shell.

Cible :

- garder la page comme shell léger ;
- déplacer l'orchestration de navigation et de chargement dans :
  - `modules/dashboard/containers/AdminDashboardShell.tsx`
  - `modules/navigation/store/admin-navigation.store.ts`
  - `modules/profile/hooks/useAdminProfile.ts`

### 6.3.3 Vues admin

Chaque vue métier doit posséder :

- son dossier ;
- ses hooks ;
- son client API ;
- ses types ;
- ses composants internes.

Exemple :

- `modules/dispatch/`
  - `api/dispatch.api.ts`
  - `hooks/useDispatchSnapshot.ts`
  - `hooks/useDispatchSettings.ts`
  - `components/DispatchPanel.tsx`
  - `components/DispatchAuditTable.tsx`

Même logique pour :

- `channels`
- `automations`
- `notifications`
- `observability`
- `settings`

## 6.4 Ordre d'exécution admin

### Étape A1

- découper `lib/api.ts` par domaine

### Étape A2

- extraire les mappers et normalisations dans `shared/mappers`

### Étape A3

- créer un shell dashboard plus léger

### Étape A4

- regrouper les vues en modules métier

### Étape A5

- brancher les types partagés depuis `packages/shared-contracts`

## 7. Lots de travail concrets

## 7.1 Lot 1 : fondations communes

Contenu :

- créer `packages/shared-contracts`
- définir contrats socket
- définir DTO UI partagés
- standardiser enums/statuts

Livrables :

- package commun versionné dans le monorepo
- premier usage côté backend, front et admin

## 7.2 Lot 2 : désengorgement backend

Contenu :

- extraction mappers/query services du gateway
- découpage dispatcher
- pipeline ingress

Livrables :

- gateway réduit
- dispatcher découpé en use cases
- flux entrant documenté

## 7.3 Lot 3 : désengorgement front

Contenu :

- scinder `chatStore`
- isoler router d'événements socket
- découper containers chat

Livrables :

- stores spécialisés
- meilleure lisibilité des mises à jour temps réel

## 7.4 Lot 4 : désengorgement admin

Contenu :

- casser `lib/api.ts`
- modulariser les vues
- normaliser les mappers

Livrables :

- client admin par domaine
- shell admin allégé

## 7.5 Lot 5 : automations et channels

Contenu :

- provider strategy côté channels
- triggers auto-message indépendants

Livrables :

- services spécialisés par provider
- job master réduit

## 8. Garde-fous de mise en œuvre

### 8.1 Ne pas faire

- ne pas renommer tout le projet d'un coup ;
- ne pas casser les routes HTTP existantes en première phase ;
- ne pas changer les noms d'événements socket sans couche de compatibilité ;
- ne pas faire une migration "big bang".

### 8.2 Toujours faire

- ajouter des tests avant de déplacer un flux critique ;
- mesurer la taille des fichiers critiques avant/après ;
- introduire des façades de compatibilité ;
- documenter chaque domaine restructuré.

### 8.3 Seuils de contrôle

À viser progressivement :

- aucun service métier critique > 300-400 lignes ;
- aucun fichier API client > 200-250 lignes ;
- aucun gateway avec logique métier embarquée ;
- un seul niveau de responsabilité principal par fichier.

## 9. Plan de tests associé

Chaque grande phase doit être accompagnée de tests.

### Backend

- webhook entrant
- dispatch initial
- réinjection SLA
- conversations en attente
- canaux dédiés
- auto-messages
- auth socket

### Front

- réception événement socket
- merge de conversation
- unread counters
- optimistic send
- pagination

### Admin

- clients API par domaine
- chargement dashboard
- actions dispatch/channels/automation
- normalisations de données

## 10. Planning recommandé

### Sprint 1

- package `shared-contracts`
- extraction des mappers backend realtime
- découpage admin `lib/api.ts`

### Sprint 2

- découpage dispatcher
- premières queries realtime
- scission du store front

### Sprint 3

- pipeline ingress
- router socket front
- shell admin refactorisé

### Sprint 4

- channels par provider
- triggers auto-message séparés
- documentation d'architecture mise à jour

## 11. Résultat attendu

Si ce plan est exécuté correctement, le projet gagnera :

- une architecture plus lisible ;
- des fichiers plus petits ;
- des domaines explicites ;
- moins de couplage ;
- moins de risque de régression ;
- une meilleure vitesse d'évolution ;
- une meilleure capacité d'onboarding ;
- une base saine pour la suite.

## 12. Priorités absolues

Si vous devez commencer par le minimum utile, commencez dans cet ordre :

1. créer les contrats partagés ;
2. découper le gateway backend ;
3. découper le dispatcher backend ;
4. casser `admin/src/app/lib/api.ts` ;
5. scinder `front/src/store/chatStore.ts` ;
6. découper `InboundMessageService` ;
7. découper `ChannelService` ;
8. séparer les triggers de `AutoMessageMasterJob`.

## 13. Conclusion

Le projet n'a pas besoin d'une réécriture totale. Il a besoin d'un découpage discipliné, domaine par domaine, en gardant l'existant fonctionnel pendant la transition.

Le bon levier est :

- stabiliser les contrats ;
- extraire les responsabilités ;
- transformer les gros fichiers en façades minces ;
- faire émerger des modules et sous-modules réellement responsables d'un seul sujet.

Ce plan fournit une trajectoire de restructuration progressive, réaliste et exploitable pour traiter les goulots actuels et réduire durablement la complexité.
