# Backlog de restructuration — Tickets par priorité

Date : 2026-04-13  
Sources : `RAPPORT_ARCHITECTURE_CODE_2026-04-13.md` + `PLAN_RESTRUCTURATION_BACK_FRONT_ADMIN_2026-04-13.md`

---

## Légende

| Priorité | Signification |
|----------|---------------|
| **P0** | Pré-requis bloquant — doit être fait avant tout autre ticket |
| **P1** | Zone critique backend — risque élevé de régression, fort impact |
| **P2** | Refactoring frontend / admin — important mais non bloquant |
| **P3** | Tests, documentation, observabilité — hardening progressif |

| Complexité | Estimation réelle (équipe restreinte, système en production) |
|------------|-------------------------------------------------------------|
| XS | < 1 jour |
| S | 1–2 jours |
| M | 3–5 jours |
| L | 1–2 semaines |
| XL | > 2 semaines |

---

## Avertissement sur la durée

Ce backlog contient **42 tickets** répartis sur 12 epics. L'estimation honnête :

- **Théorique (4 sprints de 2 semaines)** : 2 mois
- **Réaliste (production active, tests à maintenir, régressions à investiguer)** : **4 à 6 mois**

Le plan est volontairement séquencé pour livrer des résultats visibles à chaque sprint. Si la durée totale devient un frein, prioriser strictement P0 + les tickets P1 de EPIC-02 et EPIC-03 — le reste peut attendre.

---

## Règle des façades : fermeture obligatoire

Chaque ticket qui introduit une façade de compatibilité (`DispatcherService` → use cases, `chatStore` → sous-stores, etc.) génère **obligatoirement** un ticket de nettoyage associé. Ces tickets de nettoyage (`-CLEANUP`) sont en P3 mais planifiés dès la création de la façade. Sans ça, les façades restent indéfiniment.

---

## Stratégie de branches et déploiement

- Chaque epic a sa propre branche feature (`feature/epic-02-gateway`, etc.)
- Les epics sont mergées sur `master` via Pull Request avec review
- Jamais de merge direct sur `master`, jamais de merge direct sur `production`
- `production` ne reçoit que des releases validées depuis `master`
- Les tickets qui touchent le chemin chaud (gateway, ingress, dispatcher) nécessitent un déploiement en staging avant merge sur `master`
- Pour les changements sur le gateway temps réel (EPIC-02) : déployer en période creuse

---

## EPIC-00 — Pré-requis (avant tout refactoring)

> **Priorité P0 — Bloquant avant tout autre ticket**  
> Travailler sans cartographie des tests existants ni décision sur le FlowBot revient à refactorer à l'aveugle et potentiellement à jeter du travail.

---

### TICKET-00-A — Inventaire des tests existants par service ✅ TERMINÉ

**Priorité :** P0  
**Complexité :** S  
**Dépendances :** aucune

**Problème :**  
Avant de déplacer du code, il faut savoir quels services sont couverts par des tests et à quel niveau. Extraire `DispatchPolicyService` depuis `DispatcherService` cassera `dispatcher.service.spec.ts` si ce fichier teste des méthodes privées ou des comportements couplés.

**Travail à faire :**
- Lister tous les fichiers `.spec.ts` existants dans `message_whatsapp/src`
- Pour chaque service critique (dispatcher, gateway, inbound, channel, auto-message) : noter quelles méthodes sont couvertes et à quel niveau (unitaire / intégration)
- Produire un tableau : `Service → Fichier spec → Méthodes couvertes → Niveau`
- Identifier les services sans aucun test (zones à risque rouge)

**Critères d'acceptation :**
- Le tableau est disponible et versionné dans `docs/test-coverage-map.md`
- Tout ticket de refactoring P1 référence ce tableau avant de commencer

---

### TICKET-00-B — Décision de gouvernance : FlowBot vs refactoring EPIC-07

**Priorité :** P0  
**Complexité :** XS  
**Dépendances :** aucune

**Problème :**  
Le plan `memory/plan-module-chatbot.md` prévoit de remplacer **entièrement** `auto-message-master.job.ts` et `AutoMessageOrchestrator` par un module FlowBot. Si cette décision est prise, TICKET-07-A (découpage des 8 triggers en services séparés) devient du travail à jeter — on refactorerait du code destiné à être supprimé dans 3 sprints.

**Décision à prendre (oui/non) :**

| Question | Réponse attendue |
|----------|-----------------|
| Le FlowBot est-il planifié dans les 6 prochains mois ? | Oui / Non |
| TICKET-07-A est-il utile comme étape de migration FlowBot ou du travail redondant ? | Décision à prendre |

**Conséquences selon la décision :**
- **FlowBot dans < 6 mois** → TICKET-07-A rétrogradé en P3 ou supprimé, EPIC-07 réduit à TICKET-07-B uniquement
- **FlowBot dans > 6 mois ou incertain** → TICKET-07-A reste P1, les triggers séparés faciliteront la migration ultérieure

**Critères d'acceptation :**
- La décision est documentée dans ce fichier (colonne "Décision" ajoutée au tableau ci-dessus)
- TICKET-07-A est soit confirmé, soit explicitement dépriorisé avec justification

---

## EPIC-01 — Contrats d'interfaces explicites

> ~~EPIC-01 était initialement "shared-contracts" (package partagé entre les 3 apps).~~  
> **Décision architecturale :** approche supprimée — chaque app (backend, front, admin) se déploie indépendamment via Docker et doit rester autonome au build. Un package partagé créerait un couplage de build incompatible avec le déploiement multi-serveur.  
>
> **Tickets 01-A et 01-B supprimés.**  
> **Ticket 01-C conservé et redéfini** : les contrats socket sont typés localement dans chaque app (pas de package partagé).

---

### ~~TICKET-01-A~~ — SUPPRIMÉ

> Setup `packages/shared-contracts` — incompatible avec le déploiement Docker indépendant par app.  
> Tous les tickets qui avaient `dep: 01-A` ont été mis à jour.

---

### ~~TICKET-01-B~~ — SUPPRIMÉ

> Extraction des enums dans shared-contracts — supprimé avec 01-A.  
> Les enums restent définis inline dans chaque app (divergence explicitement acceptée, enums stables par nature).

---

### TICKET-01-C — Typer les contrats d'événements Socket.IO localement

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-00-A ✓

**Problème :**  
Les noms d'événements et la forme des payloads socket sont définis côté backend et supposés côté frontend sans contrat formel. Un renommage backend casse le front silencieusement.

**Approche (sans package partagé) :**  
Chaque app définit ses propres constantes typées. La cohérence entre backend et frontend est garantie par les tests d'intégration socket (TICKET-10-D), pas par le compilateur.

**Travail à faire — Backend :**
- Créer `src/realtime/events/socket-events.constants.ts` — constantes noms d'événements
- Créer `src/realtime/events/socket-events.types.ts` — interfaces payload pour chaque événement
- Le gateway et les publishers utilisent uniquement ces constantes (plus de strings littéraux)

**Travail à faire — Frontend :**
- Créer `src/lib/socket/socket-events.constants.ts` — mêmes constantes, copiées manuellement
- Créer `src/lib/socket/socket-events.types.ts` — mêmes interfaces payload
- `SocketProvider` et les stores utilisent ces constantes

**Critères d'acceptation :**
- Zéro string littéral d'événement socket dans le gateway, les publishers et les stores
- Les deux fichiers de constantes (backend + front) sont identiques — vérifié à la PR
- Un renommage d'événement côté backend génère une erreur TypeScript dans le même app immédiatement
- Les tests socket (TICKET-10-D) constituent le filet de sécurité cross-app

---

## EPIC-02 — Découpage du Gateway temps réel

> **Priorité P1 — Zone la plus risquée du backend**  
> `WhatsappMessageGateway` concentre : auth socket, room management, lecture DB, mapping DTO, orchestration métier, publication d'événements. Un changement dans un handler peut casser n'importe quel autre flux sans warning.  
> **Règle de déploiement :** tout changement sur le gateway doit être déployé en staging et validé avant merge sur `master`.

---

### TICKET-02-A — Extraire `SocketAuthService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-00-A

**Problème :**  
La validation JWT et la résolution du tenant/poste lors de la connexion socket sont dans le gateway.

**Travail à faire :**
- Vérifier dans `docs/test-coverage-map.md` si la logique auth socket est couverte — si oui, garder les tests existants et les adapter
- Créer `realtime/auth/socket-auth.service.ts`
- Y déplacer : validation du token socket, résolution du `poste_id`, contrôle du tenant
- Le gateway appelle `SocketAuthService.authenticate(client)` au lieu de le faire inline

**Critères d'acceptation :**
- Le gateway ne contient plus de logique JWT
- `SocketAuthService` est testable unitairement
- Comportement d'authentification socket inchangé

---

### TICKET-02-B — Extraire `AgentConnectionService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-02-A

**Travail à faire :**
- Créer `realtime/connections/agent-connection.service.ts`
- Y déplacer : `handleConnection`, `handleDisconnect`, suivi des postes connectés, room management
- Le gateway délègue à `AgentConnectionService`

**Critères d'acceptation :**
- Les handlers `handleConnection` / `handleDisconnect` du gateway sont < 10 lignes chacun
- 0 régression sur la détection online/offline

---

### TICKET-02-C — Extraire les query services du gateway

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-00-A

**Problème :**  
Le gateway exécute directement des requêtes DB pour charger les conversations, messages, contacts. Cela mélange transport et persistance.

**Travail à faire :**
- Créer `realtime/queries/socket-conversation-query.service.ts`
- Y déplacer : chargement des conversations initiales, messages paginés, contacts, file d'attente
- Le gateway appelle ces services et ne touche plus à aucun repository directement

**Critères d'acceptation :**
- Aucun `@InjectRepository` dans le gateway
- Les queries sont testables sans instancier le gateway
- Comportement de chargement initial inchangé

---

### TICKET-02-D — Extraire les publishers d'événements

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-01-C

**Problème :**  
Les méthodes `emitConversationAssigned`, `emitConversationReadonly`, `emitBatchReassignments`, etc. sont sur le gateway mais appelées depuis d'autres services. Le gateway est importé partout comme un bus de publication global.

**Travail à faire :**
- Créer `realtime/publishers/conversation.publisher.ts`
- Créer `realtime/publishers/message.publisher.ts`
- Créer `realtime/publishers/queue.publisher.ts`
- Déplacer toutes les méthodes `emit*` dans les publishers
- Le gateway ne conserve que les handlers socket entrants (subscribe)

**Critères d'acceptation :**
- Les publishers sont injectables indépendamment du gateway
- Le dispatcher, l'orchestrator et les autres services n'importent plus `WhatsappMessageGateway` directement
- 0 régression sur les événements temps réel

---

### TICKET-02-E — Extraire les mappers socket

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-01-C

**Travail à faire :**
- Créer `realtime/mappers/socket-conversation.mapper.ts`
- Créer `realtime/mappers/socket-message.mapper.ts`
- Les publishers utilisent ces mappers pour construire les payloads

**Critères d'acceptation :**
- Les transformations de données sont dans les mappers, testables purement (entrée → sortie)
- Les contrats de payload correspondent aux interfaces de TICKET-01-C

---

## EPIC-03 — Découpage du Dispatcher

> **Priorité P1 — Domaine le plus critique métier**  
> `DispatcherService` est le cœur de l'affectation. Toute modification locale a un rayon d'impact élevé.

---

### TICKET-03-A — Extraire `DispatchPolicyService`

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-00-A

**Problème :**  
Les règles de décision (charge minimum, canal dédié vs pool global, éligibilité) sont dans le service principal mélangées à l'orchestration.

**Travail à faire :**
- Vérifier dans `docs/test-coverage-map.md` si ces règles sont couvertes — adapter les tests existants
- Créer `dispatch/domain/dispatch-policy.service.ts`
- Y déplacer : algorithme de charge minimum, résolution poste dédié, règles d'éligibilité
- `DispatcherService` appelle `DispatchPolicyService.resolve()` pour toute décision

**Critères d'acceptation :**
- Les règles de sélection du poste sont testables sans DB
- Le service de policy ne connaît pas le gateway socket
- Comportement d'affectation inchangé

---

### TICKET-03-B — Extraire `DispatchQueryService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-00-A

**Travail à faire :**
- Créer `dispatch/infrastructure/dispatch-query.service.ts`
- Y déplacer toutes les requêtes TypeORM du dispatcher
- `DispatcherService` et `DispatchPolicyService` reçoivent les données via ce service

**Critères d'acceptation :**
- `DispatcherService` n'a plus de `QueryBuilder` direct
- Les requêtes sont mockables indépendamment pour les tests unitaires

---

### TICKET-03-C — Extraire les use cases en services applicatifs

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-03-A, TICKET-03-B

**Problème :**  
`assignConversation`, `reinjectConversation`, `redispatchWaiting`, `resetStuckActiveToWaiting` sont des cas d'usage distincts mélangés dans un même service.

**Travail à faire :**
- Créer `dispatch/application/assign-conversation.use-case.ts`
- Créer `dispatch/application/reinject-conversation.use-case.ts`
- Créer `dispatch/application/redispatch-waiting.use-case.ts`
- Créer `dispatch/application/reset-stuck-active.use-case.ts`
- `DispatcherService` devient une **façade** qui délègue à ces use cases
- Planifier TICKET-03-C-CLEANUP dès maintenant (voir ci-dessous)

**Critères d'acceptation :**
- Chaque use case est testable en isolation
- L'API publique de `DispatcherService` reste inchangée (pas de régression contrôleurs)
- Les side effects (socket, notifications) sont branchés autour des use cases, pas dedans

---

### TICKET-03-C-CLEANUP — Supprimer la façade `DispatcherService`

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-03-C + tous les consommateurs migrés vers les use cases

**Travail à faire :**
- Vérifier que tous les appelants de `DispatcherService` importent maintenant directement les use cases
- Supprimer les méthodes déléguées de `DispatcherService`
- Garder uniquement ce qui n'a pas de use case dédié (s'il en reste)

**Critères d'acceptation :**
- `DispatcherService` ne contient plus de méthodes de délégation vides
- 0 erreur TypeScript, CI vert

---

### TICKET-03-D — Extraire `SlaPolicyService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-03-A

**Travail à faire :**
- Créer `dispatch/domain/sla-policy.service.ts`
- Y déplacer : calcul deadline, comparaison seuil, décision réinjection
- Le cron SLA appelle `SlaPolicyService.shouldReinject(chat)` → booléen

**Critères d'acceptation :**
- La règle SLA est testable purement (date en entrée → décision en sortie)
- Le cron ne contient plus de règle métier

---

## EPIC-04 — Découpage de l'Ingress omnicanal

> **Priorité P1 — Pipeline d'entrée de tous les messages**

---

### TICKET-04-A — Refactorer `InboundMessageService` en pipeline explicite

**Priorité :** P1  
**Complexité :** L  
**Dépendances :** TICKET-02-D, TICKET-03-C

**Problème :**  
`InboundMessageService` fait séquentiellement 8 responsabilités dans une seule méthode.

**Pipeline cible :**

```
1. ingress/domain/chat-id-validation.service.ts
2. ingress/domain/provider-enrichment.service.ts
3. → assign-conversation.use-case
4. ingress/infrastructure/incoming-message-persistence.service.ts
5. ingress/infrastructure/media-persistence.service.ts
6. → conversation state update
7. → conversation.publisher (socket)
8. → EventEmitter2 'inbound.message.processed' (automation trigger)
```

**Travail à faire :**
- Créer les 4 services d'ingress listés ci-dessus
- Transformer `InboundMessageService` en orchestrateur de pipeline (appels séquentiels, pas de logique)
- Le déclenchement des automatisations passe par `EventEmitter2` (découplage complet)

**Critères d'acceptation :**
- `InboundMessageService.process()` n'a plus de logique métier inline — uniquement des appels de services
- Chaque étape du pipeline est testable indépendamment
- Le flux entrant complet est documenté en commentaire dans le fichier orchestrateur

---

### TICKET-04-B — Extraire `MediaExtractionService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** aucune (extractible indépendamment)

**Travail à faire :**
- Créer `ingress/domain/media-extraction.service.ts`
- Créer `ingress/infrastructure/media-persistence.service.ts`
- Y déplacer toute la logique média

**Critères d'acceptation :**
- La logique média est testable indépendamment de la logique de message
- Comportement existant inchangé

---

## EPIC-05 — Découpage des Channels par provider

> **Priorité P1**  
> `ChannelService` contient des `if (provider === 'whapi') ... else if (provider === 'meta') ...` pour chaque opération. Le pattern adapter est excellent côté ingress mais pas appliqué côté provisioning.

---

### TICKET-05-A — Créer l'interface `ChannelProviderStrategy`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** aucune

**Travail à faire :**
- Définir l'interface `ChannelProviderStrategy` : `create()`, `update()`, `validateWebhook()`, `refreshToken()`
- Créer `channels/domain/channel-provider.registry.ts`

**Critères d'acceptation :**
- L'interface est définie et documentée
- Le registry est vide mais fonctionnel

---

### TICKET-05-B — Implémenter les stratégies par provider

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-05-A

**Travail à faire :**
- Créer `channels/providers/whapi-channel-provider.service.ts`
- Créer `channels/providers/meta-channel-provider.service.ts`
- Créer `channels/providers/messenger-channel-provider.service.ts`
- Créer `channels/providers/instagram-channel-provider.service.ts`
- Créer `channels/providers/telegram-channel-provider.service.ts`
- Déplacer la logique spécifique à chaque provider depuis `ChannelService`

**Critères d'acceptation :**
- `ChannelService` ne contient plus de `if (provider === ...)` pour la logique de provisioning
- Chaque provider strategy est testable indépendamment
- Comportement identique en production

---

### TICKET-05-C — Extraire use cases channel + préparer la façade

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** TICKET-05-B

**Travail à faire :**
- Créer `channels/application/create-channel.use-case.ts`
- Créer `channels/application/assign-channel-poste.use-case.ts`
- Créer `channels/application/resolve-tenant.use-case.ts`
- `ChannelService` devient une **façade**
- Planifier TICKET-05-C-CLEANUP

**Critères d'acceptation :**
- Les cas d'usage sont testables sans instancier tout le `ChannelService`

---

### TICKET-05-C-CLEANUP — Supprimer la façade `ChannelService`

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-05-C + tous les consommateurs migrés

**Travail à faire :**
- Vérifier que tous les appelants importent directement les use cases ou les stratégies provider
- Supprimer les méthodes de délégation de `ChannelService`

**Critères d'acceptation :**
- `ChannelService` ne contient plus de délégations vides
- CI vert

---

## EPIC-06 — Module Conversations (domaine explicite)

> **Priorité P1**  
> Les transitions d'état conversation sont dispersées dans plusieurs services sans validation centrale.

---

### TICKET-06-A — Créer `ConversationStateMachine` en mode détection d'abord

**Priorité :** P1  
**Complexité :** M  
**Dépendances :** TICKET-00-A

**Problème :**  
Les transitions d'état sont faites par des appels directs à `chatService.update({ status: ... })` depuis le dispatcher, le gateway, l'orchestrator, les jobs. Aucune validation des transitions autorisées.

**Risque de migration :**  
Activer l'enforcement immédiatement sur un système en production peut casser des flux existants dont les transitions n'ont jamais été formalisées. Un rollout en deux phases est obligatoire.

**Phase 1 — Mode détection (semaines 1–2 en production) :**
- Créer `conversations/domain/conversation-state-machine.ts`
- Définir les transitions légales : `EN_ATTENTE → ACTIF`, `ACTIF → FERME`, `FERME → EN_ATTENTE`, etc.
- La machine **log un warning** si une transition interdite est détectée — elle **ne lève pas d'exception**
- Surveiller les logs pendant 2 semaines pour identifier les transitions inattendues
- Documenter toute transition surprise et décider si elle est légale ou un bug

**JALON GO/NO-GO — À évaluer avant de démarrer Phase 2 :**

| Critère | GO | NO-GO |
|---------|-----|-------|
| Aucun warning inconnu en production depuis 2 semaines | ✅ | ❌ |
| Toutes les transitions surprises ont une décision documentée (légale ou bug) | ✅ | ❌ |
| Les transitions légitimes non prévues ont été ajoutées à la machine | ✅ | ❌ |

> Si un critère est NO-GO : retour en Phase 1, ajustement de la machine, nouvelle période d'observation.  
> La Phase 2 ne peut pas commencer sous pression calendaire si un NO-GO est actif.  
> **Responsable du GO/NO-GO : tech lead — décision documentée dans la PR Phase 2.**

**Phase 2 — Mode enforcement (après GO validé) :**
- Activer l'exception sur transition interdite
- Mettre à jour les call sites si des transitions surprises de Phase 1 étaient légitimes

**Travail à faire (Phase 1) :**
- Créer la state machine avec les transitions connues
- Passer tous les `chatService.update({ status: ... })` par la machine en mode warning
- Ajouter un test unitaire pour chaque transition légale et illégale connue

**Critères d'acceptation Phase 1 :**
- La machine est active en production en mode warning
- 0 exception levée (mode détection uniquement)
- Les warnings sont visibles dans les logs avec contexte (service appelant, transition tentée)

**Critères d'acceptation Phase 2 :**
- Impossible de passer un état invalide sans exception
- Aucun warning non résolu en production

---

### TICKET-06-B — Extraire `ConversationReadQueryService`

**Priorité :** P1  
**Complexité :** S  
**Dépendances :** aucune

**Travail à faire :**
- Créer `conversations/infrastructure/conversation-read-query.service.ts`
- Centraliser toutes les requêtes SELECT sur `whatsapp_chat` pour les flows de lecture

**Critères d'acceptation :**
- Un seul point d'entrée pour les lectures de conversation
- Les requêtes sont documentées avec leurs index SQL utilisés

---

## EPIC-07 — Automations

> **Priorité conditionnelle — voir TICKET-00-B**  
> Si FlowBot est planifié dans les 6 prochains mois, TICKET-07-A est rétrogradé en P3 ou supprimé.  
> TICKET-07-B reste P1 dans tous les cas.

---

### TICKET-07-A — Séparer chaque trigger en service indépendant

**Priorité :** P1 *(si FlowBot > 6 mois)* / P3 *(si FlowBot < 6 mois — voir TICKET-00-B)*  
**Complexité :** M  
**Dépendances :** TICKET-00-B (décision requise avant de démarrer)

**Travail à faire :**
- Créer `automations/triggers/no-response.trigger.ts` (Trigger A)
- Créer `automations/triggers/out-of-hours.trigger.ts` (Trigger B)
- Créer `automations/triggers/reopened.trigger.ts` (Trigger C)
- Créer `automations/triggers/queue-wait.trigger.ts` (Trigger D)
- Créer `automations/triggers/keyword.trigger.ts` (Trigger E)
- Créer `automations/triggers/client-type.trigger.ts` (Trigger F)
- Créer `automations/triggers/inactivity.trigger.ts` (Trigger G)
- Créer `automations/triggers/on-assign.trigger.ts` (Trigger H/I)
- Créer `automations/triggers/trigger-runner.service.ts`
- `AutoMessageMasterJob.run()` délègue au runner

**Critères d'acceptation :**
- Chaque trigger est testable indépendamment
- `AutoMessageMasterJob` ne contient plus de logique métier
- Comportement identique en production

---

### TICKET-07-B — Documenter l'état métier conversation lié aux automatisations ✅ TERMINÉ

**Priorité :** P1 *(dans tous les cas)*  
**Complexité :** S  
**Dépendances :** aucune

**Problème :**  
`whatsapp_chat` contient ~19 champs liés aux automatisations. Leur sémantique n'est documentée nulle part. Ce document sera la référence pour savoir quels champs supprimer lors de la migration FlowBot.

**Travail à faire :**
- Créer `docs/auto-message-state-model.md`
- Documenter chaque champ : rôle, qui le lit, qui l'écrit, transitions valides

**Critères d'acceptation :**
- Le document est complet et versionné
- Chaque champ a une fiche : nom, type, propriétaire, cycle de vie

---

## EPIC-08 — Refactoring Frontend opérateur

> **Priorité P2**

---

### TICKET-08-A — Scinder `chatStore.ts` en sous-stores

**Priorité :** P2  
**Complexité :** M  
**Dépendances :** TICKET-01-C

**Problème :**  
`chatStore.ts` concentre trop de responsabilités. C'est le point de couplage de toute l'UI front.

**Travail à faire :**
- Créer `modules/conversations/store/conversation.store.ts`
- Créer `modules/chat/store/message.store.ts`
- Créer `modules/realtime/store/socket-session.store.ts`
- Extraire la logique d'unread : `modules/conversations/services/unread-counter.service.ts`
- Extraire la logique de merge : `modules/conversations/services/conversation-merge.service.ts`
- Garder `chatStore` comme **façade** le temps de migrer les composants
- Planifier TICKET-08-A-CLEANUP dès maintenant

**Critères d'acceptation :**
- Chaque store < 150 lignes
- Les composants peuvent importer uniquement le store dont ils ont besoin
- Comportement UI inchangé (conversations, messages, unread, typing)

---

### TICKET-08-A-CLEANUP — Supprimer la façade `chatStore`

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-08-A + tous les composants migrés vers les sous-stores

**Travail à faire :**
- Vérifier que tous les composants importent directement les sous-stores
- Supprimer les exports de délégation de `chatStore`

**Critères d'acceptation :**
- `chatStore` n'existe plus ou ne contient plus de délégations
- CI et build front verts

---

### TICKET-08-B — Extraire les mappers frontend

**Priorité :** P2  
**Complexité :** S  
**Dépendances :** TICKET-01-C

**Travail à faire :**
- Créer `modules/chat/mappers/message.mapper.ts`
- Créer `modules/conversations/mappers/conversation.mapper.ts`
- Les stores transforment les payloads socket via ces mappers

**Critères d'acceptation :**
- Aucune normalisation inline dans les handlers socket du store
- Les mappers sont testables (entrée → sortie)

---

### TICKET-08-C — Refactorer `SocketProvider` en routeur d'événements

**Priorité :** P2  
**Complexité :** M  
**Dépendances :** TICKET-01-C, TICKET-08-A

**Travail à faire :**
- Créer `modules/realtime/services/socket-connection.service.ts` (cycle de vie)
- Créer `modules/realtime/services/socket-event-router.service.ts` (dispatch vers stores)
- `SocketProvider` orchestre sans logique inline

**Critères d'acceptation :**
- La connexion socket et le routage des événements sont découplés
- Un nouvel événement socket s'ajoute en une ligne dans le routeur

---

### TICKET-08-D — Refactorer la page `whatsapp` en containers métier

**Priorité :** P2  
**Complexité :** S  
**Dépendances :** TICKET-08-A

**Travail à faire :**
- Extraire `modules/chat/containers/ChatWorkspace.tsx`
- Extraire `modules/conversations/containers/ConversationSidebar.tsx`
- Extraire hooks : `useConversationSearch`, `useConversationFilters`, `useConversationSelection`
- La page `whatsapp/page.tsx` ne contient que la composition

**Critères d'acceptation :**
- `page.tsx` < 50 lignes
- Chaque container est importable et testable indépendamment

---

## EPIC-09 — Refactoring Frontend admin

> **Priorité P2**

---

### TICKET-09-A — Découper `admin/src/app/lib/api.ts` par domaine ✅ TERMINÉ

**Priorité :** P2  
**Complexité :** M  
**Dépendances :** aucune *(dépendance initiale à TICKET-01-A supprimée avec EPIC-01)*

**Résultat :**  
`api.ts` découpé en 12 fichiers de domaine dans `admin/src/app/lib/api/` :  
`_http.ts` (utilitaire interne), `auth.api.ts`, `channels.api.ts`, `conversations.api.ts`, `dispatch.api.ts`, `metrics.api.ts`, `notifications.api.ts`, `system-config.api.ts`, `automations.api.ts`, `postes.api.ts`, `commerciaux.api.ts`, `clients.api.ts`, `crons.api.ts`.  
`api.ts` conservé comme façade de re-export — EXIT:0.

**Critères d'acceptation :**
- Chaque fichier < 200 lignes ✅
- Aucune logique de normalisation dans les fichiers API ✅ *(normalisation isolée dans `conversations.api.ts`)*
- Comportement fonctionnel inchangé ✅

---

### TICKET-09-A-CLEANUP — Supprimer le re-export `api.ts`

**Priorité :** P3  
**Complexité :** XS  
**Dépendances :** TICKET-09-A + toutes les vues migrées

**Travail à faire :**
- Vérifier qu'aucun composant n'importe encore depuis `lib/api.ts`
- Supprimer le fichier ou le vider

**Critères d'acceptation :**
- `lib/api.ts` est supprimé ou vide
- CI admin vert

---

### TICKET-09-B — Extraire les mappers et normalisations admin

**Priorité :** P2  
**Complexité :** S  
**Dépendances :** TICKET-09-A

**Travail à faire :**
- Créer `shared/mappers/chat.mapper.ts`, `channel.mapper.ts`, `metrics.mapper.ts`
- Les fonctions API retournent des données brutes, les vues utilisent les mappers

**Critères d'acceptation :**
- Les normalisations ne sont pas dans les fichiers API ni dans les composants

---

### TICKET-09-C — Modulariser les vues admin par domaine

**Priorité :** P2  
**Complexité :** L  
**Dépendances :** TICKET-09-A, TICKET-09-B

**Travail à faire :**
- Pour chaque domaine (`dispatch`, `channels`, `automations`, `notifications`, `observability`, `settings`) :
  - `modules/{domaine}/api/{domaine}.api.ts`
  - `modules/{domaine}/hooks/use{Domaine}.ts`
  - `modules/{domaine}/components/{Domaine}View.tsx`
- La page principale devient un shell de navigation léger

**Critères d'acceptation :**
- Chaque module admin est autonome
- L'ajout d'une nouvelle vue admin n'impacte pas les vues existantes

---

## EPIC-10 — Tests d'intégration métier

> **Priorité P3 — Mais pas "après" — intégrés dans les sprints P1**  
> Les tickets EPIC-10 ne sont pas des tickets de rattrapage — ils sont planifiés **dans le même sprint** que les refactorings qu'ils couvrent (voir planning). Un ticket P1 sans test minimal dans son sprint de livraison est considéré incomplet.  
>
> **Règle de test minimal par ticket P1 :**  
> Chaque ticket P1 qui extrait un service doit inclure dans ses critères d'acceptation au moins un test unitaire sur les règles extraites. Les tickets EPIC-10 ajoutent la couverture d'intégration par-dessus, pas à la place.

---

### TICKET-10-A — Tests d'intégration du dispatch (couverture partielle — Sprint 4)

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-03-C *(uniquement — exécutable dès Sprint 4)*

> **Pourquoi scindé ?**  
> L'ancienne TICKET-10-A dépendait à la fois de TICKET-03-C (Sprint 4) et de TICKET-04-A (Sprint 6). Elle ne pouvait donc pas être exécutée avant Sprint 6, ce qui contredisait l'intention d'écrire les tests en parallèle des refactorings. Scission en deux tickets alignés sur leurs dépendances réelles.

**Travail à faire :**
- Test : conversation créée → poste assigné correctement (use case `assign-conversation`)
- Test : conversation EN_ATTENTE → réinjection après SLA (`reinject-conversation`)
- Test : canal dédié → affectation exclusive au poste dédié

**Critères d'acceptation :**
- Tests en conditions proches de la production (vraie DB de test)
- Couvre les règles de dispatch sans dépendre du pipeline ingress complet
- Ne teste pas la couche ingress (validation webhook, chat_id) — c'est dans 10-A-BIS

---

### TICKET-10-A-BIS — Tests d'intégration flux complet webhook → dispatch → socket (Sprint 6+)

**Priorité :** P3  
**Complexité :** M  
**Dépendances :** TICKET-04-A, TICKET-02-D *(exécutable seulement après Sprint 6)*

**Travail à faire :**
- Test : webhook entrant → normalisation → conversation créée → poste assigné → événement socket émis
- Test : webhook entrant → conversation existante → mise à jour unread → socket mis à jour
- Test : webhook avec chat_id inconnu → rejet propre *(relève du pipeline ingress, pas du dispatch seul)*
- Test : pipeline ingress complet avec média (téléchargement + persistance)

**Critères d'acceptation :**
- Couvre le golden path de bout en bout (provider → DB → socket)
- Tests en conditions proches de la production (vraie DB de test)

---

### TICKET-10-B — Tests d'intégration SLA et réinjection

**Priorité :** P3  
**Complexité :** M  
**Dépendances :** TICKET-03-D

**Travail à faire :**
- Test : conversation ACTIF, poste déconnecté → réinjection EN_ATTENTE
- Test : conversation EN_ATTENTE > seuil → réaffectation autre poste
- Test : canal dédié → affectation exclusive au poste dédié

**Critères d'acceptation :**
- Chaque scénario de dispatch critique a un test d'intégration

---

### TICKET-10-C — Tests d'intégration auto-messages

**Priorité :** P3  
**Complexité :** M  
**Dépendances :** TICKET-07-A *(ou FlowBot si TICKET-00-B décide de skipper 07-A)*

**Travail à faire :**
- Test : trigger no-response → message envoyé après délai
- Test : trigger bloqué par `read_only` existant
- Test : fenêtre 23h expirée → message non envoyé
- Test : max steps atteint → séquence terminée

---

### TICKET-10-D — Tests socket front

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-08-B

**Travail à faire :**
- Test : réception `conversation:assigned` → store mis à jour correctement
- Test : réception `message:new` → message ajouté à la bonne conversation
- Test : optimistic send → réconciliation avec ID réel

---

## EPIC-11 — Observabilité et documentation d'états

> **Priorité P3 — Hardening**

---

### TICKET-11-A — Documenter la machine d'état conversation ✅ TERMINÉ

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-06-A Phase 1 ✓

**Résultat :**  
`docs/conversation-state-machine.md` créé.  
3 états · 8 transitions légales · 6 services documentés.  
2 angles morts identifiés en Phase 1 (Gateway admin + ReadOnlyEnforcementJob — bypasses légitimes, à instrumenter Phase 2).  
Phase 2 GO/NO-GO : critères satisfaits, en attente signature tech lead.

---

### TICKET-11-B — Documenter les contrats d'événements Socket.IO

**Priorité :** P3  
**Complexité :** S  
**Dépendances :** TICKET-01-C

**Travail à faire :**
- Créer `docs/socket-events-contract.md`
- Documenter chaque événement : nom, émetteur, payload, consommateurs

---

### TICKET-11-C — Traçage corrélé webhook → message → chat → socket

**Priorité :** P3  
**Complexité :** M  
**Dépendances :** TICKET-04-A

**Travail à faire :**
- Ajouter un `correlationId` généré à l'entrée du webhook
- Propager le `correlationId` dans tous les logs du pipeline
- Permettre de retrouver en log le chemin complet d'un message

**Critères d'acceptation :**
- Un `grep correlationId=<id>` dans les logs retrace tout le flux d'un message

---

## Résumé des priorités

| Epic | Tickets | Priorité | Complexité totale | Note |
|------|---------|----------|-------------------|------|
| EPIC-00 Pré-requis | 2 | P0 | S | ✅ **00-A terminé** |
| ~~EPIC-01 Shared-contracts~~ | ~~3~~ → 1 | P1 | M | **01-A + 01-B supprimés** — 01-C redéfini sans package partagé |
| EPIC-02 Gateway temps réel | 5 | P1 | L | ✅ **02-A ✅ 02-B ✅ 02-C ✅ 02-D ✅ 02-E** — staging obligatoire |
| EPIC-03 Dispatcher | 5 (dont 1 cleanup) | P1 / P3 | L | ✅ **03-A ✅ 03-B ✅ 03-C ✅ 03-D ✅ 03-C-CLEANUP** |
| EPIC-04 Ingress pipeline | 2 | P1 | L | ✅ **04-A ✅ 04-B** |
| EPIC-05 Channels par provider | 4 (dont 1 cleanup) | P1 / P3 | M | ✅ **05-A ✅ 05-B ✅ 05-C ✅ 05-C-CLEANUP** |
| EPIC-06 Domaine Conversations | 2 | P1 | M | ✅ **06-A Phase 1 ✅ 06-B** — Phase 2 GO/NO-GO en attente |
| EPIC-07 Automations | 2 | P1 ou P3 | M | ✅ **07-B terminé** — 07-A conditionnel à TICKET-00-B |
| EPIC-08 Front opérateur | 5 (dont 1 cleanup) | P2 / P3 | M | ✅ **08-A ✅ 08-B ✅ 08-C ✅ 08-D** — 08-A-CLEANUP en P3 |
| EPIC-09 Front admin | 4 (dont 1 cleanup) | P2 / P3 | L | ✅ **09-A ✅ 09-B ✅ 09-C ✅ 09-A-CLEANUP** |
| EPIC-10 Tests intégration | 5 (dont 10-A-BIS) | P3 | M | ✅ **10-A ✅ 10-A-BIS ✅ 10-B** — planifiés dans les sprints P1 |
| EPIC-11 Observabilité/docs | 3 | P3 | M | ✅ **11-A ✅ 11-B ✅ 11-C** — EPIC complet |

**Total : 40 tickets actifs** (01-A et 01-B supprimés · 3 tickets terminés : 00-A, 07-B, 09-A · 5 cleanups · 1 ticket 10-A-BIS)

---

## Planning par sprint avec livrable visible

> Chaque sprint doit produire un résultat tangible visible au-delà du refactoring interne, pour garder la motivation et justifier le travail auprès de l'équipe.

```
Sprint 0 ✅ TERMINÉ
  TICKET-00-A ✅  inventaire tests existants
  TICKET-00-B     décision FlowBot (en attente)
  → Livrable : docs/test-coverage-map.md versionné

Sprint 1 ✅ TERMINÉ
  ~~TICKET-01-A~~  SUPPRIMÉ (shared-contracts incompatible Docker multi-serveur)
  ~~TICKET-01-B~~  SUPPRIMÉ (enums inline acceptés)
  TICKET-07-B ✅   documenter les champs auto-message → docs/auto-message-state-model.md
  TICKET-09-A ✅   découper admin api.ts → 12 fichiers de domaine dans lib/api/
  → Livrable : admin api.ts = façade de re-export · EXIT:0

Sprint 2 ✅ TERMINÉ
  TICKET-01-C ✅  contrats événements socket (local, sans package partagé) [dep: 00-A ✓]
  TICKET-02-A ✅  SocketAuthService                                         [dep: 00-A ✓]
  TICKET-02-C ✅  query services gateway                                    [dep: 00-A ✓]
  TICKET-03-B ✅  DispatchQueryService                                      [dep: 00-A ✓]
  TICKET-09-B ✅  mappers admin (équipe front)                              [dep: 09-A ✓]
  → Livrable : gateway délègue DB à SocketConversationQueryService
               + contrats socket typés localement (backend + front) · EXIT:0

Sprint 3 ✅ TERMINÉ
  TICKET-02-D ✅  publishers d'événements                   [dep: 01-C ✓]
  TICKET-02-E ✅  mappers socket                            [dep: 01-C ✓]
  TICKET-03-A ✅  DispatchPolicyService                     [dep: 00-A ✓]
  TICKET-08-B ✅  mappers frontend (équipe front)           [dep: 01-C ✓]
  → Livrable : ConversationPublisher + QueuePublisher + mappers centralisés
               + DispatchPolicyService (resolvePosteForChannel, isEligibleForAgentReuse, shouldExtendDeadlineOnly)
               + front/src/lib/mappers/{message,conversation}.mapper.ts · EXIT:0

Sprint 4 ✅ TERMINÉ
  TICKET-03-C ✅  use cases dispatcher                      [dep: 03-A ✓, 03-B ✓]
  TICKET-03-D ✅  SlaPolicyService                          [dep: 03-A ✓]
  TICKET-06-A ✅  ConversationStateMachine Phase 1          [dep: 00-A ✓]
  TICKET-10-A ✅  tests dispatch partiel                    [dep: 03-C ✓]
  TICKET-10-B ✅  tests SLA + réinjection                   [dep: 03-D ✓]
  → Livrable : 4 use cases (assign/reinject/redispatch/reset-stuck) + SlaPolicyService
               + ConversationStateMachine Phase 1 (mode détection — warning logs)
               + DispatcherService = façade pure + 33/33 tests · EXIT:0

  ⚠ Cohérence : TICKET-10-A (partiel) dépend de TICKET-03-C. Les deux sont en Sprint 4.
    TICKET-10-A-BIS (flux complet) est en Sprint 6, après TICKET-04-A.

  ── JALON : Observer les logs Phase 1 pendant toute la durée de Sprint 5 ──

Sprint 5 ✅ TERMINÉ
  TICKET-04-B ✅  MediaExtractionService                    [dep: aucune]
  TICKET-05-A ✅  interface ChannelProviderStrategy         [dep: aucune]
  TICKET-02-B ✅  AgentConnectionService                    [dep: 02-A ✓]
  TICKET-08-A ✅  scinder chatStore (équipe front)          [dep: 01-C ✓]
  → Livrable visible : chatStore découpé en 3 sous-stores ✅
                       + 2 semaines d'observation des logs Phase 1 terminées

  ── JALON GO/NO-GO TICKET-06-A Phase 2 — EN ATTENTE ──
  Critères GO : 0 warning inconnu, toutes transitions documentées, tech lead signe
  Si NO-GO : Phase 2 repoussée, machine ajustée, nouvelle observation

Sprint 6 ✅ TERMINÉ
  TICKET-04-A ✅  pipeline ingress complet                     [dep: 02-D ✓, 03-C ✓]
  TICKET-05-B ✅  stratégies providers channels                [dep: 05-A ✓]
                  instagram + telegram providers créés, registry branché dans ChannelService
  TICKET-06-A     Phase 2 enforcement (GO/NO-GO en attente — tech lead requis)
  TICKET-08-C ✅  SocketProvider routeur d'événements (front)  [dep: 01-C ✓, 08-A ✓]
                  WebSocketEvents.tsx = 65 lignes (orchestrateur)
                  socket-event-router.ts = handlers séparés par domaine
  TICKET-10-A-BIS ✅ tests flux complet webhook → socket       [dep: 04-A ✓, 02-D ✓]
                     15/15 tests — golden path + rejets + média + batch
  → Livrable visible : InboundMessageService = orchestrateur pur ✅
                       + ChannelService = façade de délégation (5 providers) ✅
                       + pipeline complet couvert par 15 tests ✅
                       + WebSocketEvents refactoré en routeur ✅

  ⚠ TICKET-06-A Phase 2 : GO/NO-GO non activé — observation Phase 1 requise (2 semaines logs prod)
    Responsable : tech lead — activer manuellement dans ConversationStateMachine

Sprint 7 ✅ TERMINÉ
  TICKET-05-C ✅  use cases channel + façade ChannelService  [dep: 05-B ✓]
                  create-channel.use-case · assign-channel-poste.use-case · resolve-tenant.use-case
                  10/10 tests · ChannelService = façade pure
  TICKET-08-D ✅  page whatsapp → containers métier          [dep: 08-A ✓]
                  ConversationSidebar (layout/ConversationSidebar.tsx)
                  useConversationSearch + useConversationFilters (hooks/)
                  page.tsx = 40 lignes (< 50 critère ✅)
  → Livrable visible : ChannelService = façade pure délégant aux use cases ✅
                       + page.tsx < 50 lignes, logique déportée dans containers ✅

Sprint 8 ✅ TERMINÉ
  TICKET-06-B ✅  ConversationReadQueryService              [dep: aucune]
                  conversations/infrastructure/conversation-read-query.service.ts
                  7 méthodes SELECT centralisées (findByPosteId, getTotalUnread, findAll,
                  findByChatId, findBulkByChatIds, findOneById, getStatsByPoste)
                  WhatsappChatService = façade pour les lectures · 10/10 tests
  → Livrable visible : requêtes SELECT whatsapp_chat centralisées ✅
                       + WhatsappChatService allégé (mutations uniquement)

Sprint 9 ✅ TERMINÉ
  TICKET-09-C ✅  Modulariser vues admin par domaine        [dep: 09-A ✓, 09-B ✓]
                  6 modules : channels · dispatch · automations · notifications · observability · settings
                  23 fichiers : 6×api (re-exports) + 6×hooks + 11×components (re-exports ui/)
                  Dashboard importe depuis modules · 0 erreur TS
  → Livrable visible : modules admin autonomes par domaine ✅
                       + useChannels, useDispatch, useAutomations, useObservabilite, useSettings

Sprint 10 ✅ TERMINÉ
  TICKET-03-C-CLEANUP ✅  Supprimer délégations DispatcherService
                          redispatchWaiting/resetStuck → DispatcherController directement
                          reinjectConversation → OfflineReinjectionJob directement
                          5/5 tests · 0 erreur TS
  TICKET-05-C-CLEANUP ✅  Supprimer délégations ChannelService
                          create/assignPoste → ChannelController directement
                          resolveTenant conservé (cross-module whapi.service)
                          6/6 tests · 0 erreur TS
  TICKET-09-A-CLEANUP ✅  Supprimer re-export api.ts
                          25 fichiers migrés vers imports directs de domaine
                          Façade admin/src/app/lib/api.ts supprimée · 0 erreur TS
  → Livrable visible : façades temporaires nettoyées — aucune indirection inutile

Sprint 11 ✅ TERMINÉ
  TICKET-08-A-CLEANUP  N/A — chatStore est un store Zustand composé (StateCreator)
                        sans méthodes de délégation — aucune suppression à faire
  TICKET-10-D ✅       Tests socket front (Vitest + vi.mock)
                        front/vitest.config.ts + vitest.setup.ts
                        socket-event-router.spec.ts — 8/8 tests (SC-01 à SC-08)
                        SC-01 CONVERSATION_ASSIGNED · SC-02 MESSAGE_ADD · SC-03 tempId réconciliation
                        SC-04 CONVERSATION_REMOVED · SC-05 TOTAL_UNREAD_UPDATE
                        SC-06 MESSAGE_STATUS_UPDATE · SC-07 TYPING_START autre · SC-08 TYPING_START même
  TICKET-11-B ✅       docs/socket-events-contract.md
                        3 canaux · 7 événements C→S · 14 types S→C chat:event
                        7 types S→C contact:event · 7 codes d'erreur MESSAGE_SEND_ERROR
                        Réconciliation optimistic tempId · Règles room/tenant
  TICKET-11-C ✅       Traçage corrélé webhook → message → chat → socket
                        correlationId?: string ajouté à UnifiedMessage
                        Généré dans WhapiController (header x-request-id ou UUID)
                        Propagé : controller → WhapiService → UnifiedIngressService → InboundMessageService
                        Providers : whapi · meta · messenger · instagram · telegram
                        Logs : WEBHOOK_ACCEPTED · INGRESS_START · INCOMING_RECEIVED · INCOMING_DISPATCHED
                        docs/correlation-tracing.md — 15/15 tests pipeline ✅ · 0 erreur TS
  → Livrable visible : grep correlationId=<id> retrace le flux complet d'un message ✅

Sprint 12 (prochain)
  TICKET-11-A ✅  docs/conversation-state-machine.md       [dep: 06-A Phase 1 ✓]
                  3 états · 8 transitions · 6 services · 2 angles morts documentés
                  GO/NO-GO Phase 2 en attente tech lead
  → Livrable visible : état réel de la machine d'état documenté après 2 semaines en prod ✅

Sprint 13+ — selon décision TICKET-00-B
  TICKET-07-A  triggers séparés (si FlowBot > 6 mois)      [dep: 00-B]
  TICKET-10-C  tests auto-messages                          [dep: 07-A ou FlowBot]

  BLOQUANTS EXTERNES :
    TICKET-06-A Phase 2  enforcement state machine         [dep: GO/NO-GO tech lead]
    TICKET-00-B          décision FlowBot                  [dep: décision gouvernance]
```

---

## Garde-fous permanents

### Ne jamais faire
- Merger sur `master` un refactoring de gateway ou dispatcher sans validation staging
- Introduire une façade sans créer son ticket de nettoyage correspondant
- Démarrer un ticket P1 sans consulter `docs/test-coverage-map.md`
- Activer TICKET-06-A en mode enforcement sans avoir observé 2 semaines de logs Phase 1

### Toujours faire
- Mesurer la taille du fichier avant et après chaque refactoring (ligne de base dans le ticket)
- Documenter dans chaque PR : "services déplacés", "API publique inchangée", "tests adaptés"
- Fermer le ticket de nettoyage de façade dans le sprint suivant la migration complète

### Seuils de contrôle
- Aucun service métier critique > 300–400 lignes
- Aucun fichier API client > 200 lignes
- Aucun gateway avec logique métier embarquée
- Aucune façade de compatibilité active depuis plus de 2 sprints
