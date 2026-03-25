# Audit Architecture Backend — NestJS (`message_whatsapp/`)

> **Objectif** : Évaluer si le backend respecte les principes de la Clean Architecture,
> identifier les violations, et proposer une architecture cible plus adaptée.
>
> **Date** : 2026-03-25
> **Stack analysée** : NestJS 10, TypeORM, MySQL, Socket.IO, class-validator

---

## Sommaire

1. [Rappel des principes de la Clean Architecture](#1-rappel-des-principes-de-la-clean-architecture)
2. [Structure actuelle du projet](#2-structure-actuelle-du-projet)
3. [Audit par couche](#3-audit-par-couche)
4. [Violations identifiées](#4-violations-identifiées)
5. [Points forts à conserver](#5-points-forts-à-conserver)
6. [Architecture cible proposée](#6-architecture-cible-proposée)
7. [Plan de migration progressif](#7-plan-de-migration-progressif)

---

## 1. Rappel des principes de la Clean Architecture

La Clean Architecture (Robert C. Martin) définit 4 couches concentriques avec une règle fondamentale :
**les dépendances ne peuvent pointer que vers l'intérieur** (du détail vers le domaine).

```
┌─────────────────────────────────────────────┐
│  Infrastructure (DB, HTTP, WebSocket, APIs) │  ← couche externe
│  ┌───────────────────────────────────────┐  │
│  │  Interface (Controllers, Gateways)    │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Application (Use Cases)        │  │  │
│  │  │  ┌───────────────────────────┐  │  │  │
│  │  │  │  Domain (Entities, Rules) │  │  │  │  ← couche interne
│  │  │  └───────────────────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Règle d'or** : Le domaine ne sait pas que TypeORM existe.
L'application ne sait pas que Express ou Socket.IO existent.

**Principes associés** :
- **Single Responsibility** : chaque service fait une seule chose
- **Dependency Inversion** : dépendre d'abstractions (interfaces), pas de classes concrètes
- **Open/Closed** : ouvert à l'extension, fermé à la modification
- **CQRS** (Command Query Responsibility Segregation) : séparer lecture et écriture

---

## 2. Structure actuelle du projet

```
src/
├── admin/                          # Module admin (entité + service + controller)
├── auth/                           # Authentification commerciaux (JWT)
├── auth_admin/                     # Authentification admin (session)
├── call-log/                       # Logs d'appels
├── channel/                        # Gestion des canaux WhatsApp
│   ├── entities/
│   │   ├── channel.entity.ts       # WhapiChannel (entité principale)
│   │   └── provider-channel.entity.ts
│   ├── meta-token.service.ts
│   ├── meta-token-scheduler.service.ts
│   └── channel.service.ts
├── communication_whapi/            # Envois sortants (Meta, Whapi, TG, IG, Messenger)
│   ├── communication_meta.service.ts
│   ├── communication_whapi.service.ts
│   ├── communication_telegram.service.ts
│   ├── communication_messenger.service.ts
│   ├── communication_instagram.service.ts
│   └── outbound-router.service.ts  ← pattern Adapter ✅
├── contact/                        # Contacts
├── dispatcher/                     # Dispatch conversations → agents
│   ├── dispatcher.service.ts
│   ├── services/
│   │   ├── queue.service.ts
│   │   ├── locks.service.ts
│   │   └── dispatch-settings.service.ts
│   └── entities/
├── jorbs/                          # CronJobs (tâches planifiées)
├── logging/                        # Logging structuré
├── message-auto/                   # Messages automatiques (HSM sequences)
├── metriques/                      # Métriques et analytics
├── notification/                   # Notifications WebSocket
├── system-config/                  # Configuration dynamique
├── webhooks/                       # Ingestion webhook unifiée
│   ├── adapters/                   # ← pattern Adapter ✅
│   │   ├── meta.adapter.ts
│   │   ├── whapi.adapter.ts
│   │   ├── messenger.adapter.ts
│   │   ├── instagram.adapter.ts
│   │   └── telegram.adapter.ts
│   ├── normalization/              # ← pattern Normalization ✅
│   │   ├── unified-message.ts
│   │   └── unified-status.ts
│   ├── inbound-message.service.ts
│   └── unified-ingress.service.ts
├── whapi/                          # Controller webhook + services techniques
├── whatsapp_button/
├── whatsapp_chat/                  # Entité conversation
├── whatsapp_chat_label/
├── whatsapp_commercial/            # Entité agent commercial
├── whatsapp_contacts/
├── whatsapp_customer/
├── whatsapp_error/
├── whatsapp_last_message/
├── whatsapp_media/
├── whatsapp_message/               # Entité message (envoi + reception)
├── whatsapp_message_content/
└── whatsapp_poste/                 # Entité poste (agent assigné)
```

**Observation immédiate** : 28 modules au même niveau dans `src/`. Il n'existe aucune
séparation visuelle entre couche domaine, application et infrastructure.

---

## 3. Audit par couche

### 3.1 Couche Domaine

**Ce qui existe** :
- Des entités TypeORM : `WhatsappMessage`, `WhatsappChat`, `WhapiChannel`, etc.
- Des enums : `WhatsappMessageStatus`, `WhatsappChatStatus`, `MessageDirection`

**Problèmes** :
- ❌ Les entités **sont** les objets de domaine ET les objets de persistance simultanément
  (décorateurs TypeORM `@Entity`, `@Column` mélangés avec la logique métier)
- ❌ Aucune logique de domaine encapsulée dans les entités (tout est dans les services)
  Par exemple, la règle "un message ne peut pas être modifié après envoi" n'est nulle part
- ❌ Pas de Value Objects (ex: `PhoneNumber`, `MessageContent`) pour encapsuler les validations
- ❌ Pas d'événements de domaine (`DomainEvent`) pour notifier les autres modules
  → conséquence : les modules s'importent directement les uns les autres (couplage fort)

### 3.2 Couche Application (Use Cases)

**Ce qui existe** :
- Des services qui orchestrent plusieurs autres services

**Problèmes** :
- ❌ Pas de couche "Use Case" explicite — les services font tout
- ❌ `WhatsappMessageService` accumule trop de responsabilités :
  - Sauvegarde des messages entrants (Whapi)
  - Sauvegarde des messages entrants (format unifié)
  - Envoi de messages sortants texte
  - Envoi de messages sortants médias
  - Mise à jour des statuts
  - Résolution du texte selon le type
  - Calcul du statut de conversation
  Ce service viole le principe **Single Responsibility** de façon majeure.
- ❌ `InboundMessageService` orchestre : dispatch + sauvegarde message + gateway WebSocket
  + sauvegarde médias + auto-messages → trop de responsabilités
- ❌ Pas de séparation Command / Query (CQRS) : les méthodes d'écriture et de lecture
  sont dans les mêmes services avec les mêmes repositories

### 3.3 Couche Infrastructure

**Ce qui existe** :
- TypeORM repositories injectés directement dans les services
- Adapters webhook (bon pattern ✅)
- `OutboundRouterService` (bon pattern ✅)

**Problèmes** :
- ❌ Les services de domaine dépendent directement des `Repository<Entity>` TypeORM
  (violation de la règle de dépendance : le domaine ne devrait pas connaître TypeORM)
  ```typescript
  // Exemple dans WhatsappMessageService
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly messageRepository: Repository<WhatsappMessage>,  // ← TypeORM direct
  ```
- ❌ `WhatsappMessageService` a `private readonly WHAPI_URL = 'https://gate.whapi.cloud/...'`
  → une URL hardcodée en dur dans un service de domaine, à côté d'un token lu depuis `process.env`
- ❌ Pas de couche Repository abstraite (interfaces) entre services et TypeORM
- ❌ `AppModule` enregistre des entités directement (`TypeOrmModule.forFeature([...])`)
  ce qui crée un couplage entre le module racine et des entités concrètes

### 3.4 Couche Interface (Controllers / Gateways)

**Ce qui existe** :
- Controllers NestJS (REST)
- `WhatsappMessageGateway` (WebSocket)

**Problèmes** :
- ❌ `WhapiController` fait trop de choses : validation de signature, rate limiting,
  circuit breaker, idempotence, routing vers les bons services — tout dans le même controller
- ❌ Le controller contient de la logique métier (décision de réprocesser un duplicat)
  → la logique de "faut-il réprocesser ?" devrait être dans un service
- ❌ `WhatsappMessageGateway` est importé dans `DispatcherService` via `forwardRef()`
  → dépendance circulaire révélatrice d'un mauvais découpage des responsabilités

---

## 4. Violations identifiées

### V1 — Dépendances circulaires (forwardRef)

```typescript
// dispatcher.service.ts
@Inject(forwardRef(() => WhatsappMessageGateway))
private readonly messageGateway: WhatsappMessageGateway,
```

**Cause** : Le `DispatcherService` a besoin d'émettre des événements WebSocket,
et le `WhatsappMessageGateway` a besoin du dispatcher.
**Solution** : Introduire un bus d'événements (`EventEmitter2` ou `EventBus` CQRS).
Le dispatcher émet un événement `ConversationAssigned`, le gateway l'écoute.

### V2 — Service God Object

`WhatsappMessageService` (service de ~600 lignes) combine :
- Envoi sortant Whapi
- Envoi sortant via `OutboundRouter` (tous providers)
- Réception entrant Whapi (legacy)
- Réception entrant format unifié
- Mise à jour de statut
- Résolution de texte selon type
- Récupération de message avec médias
- Recherche par provider_message_id

**Ce service devrait être découpé en au moins 4 services** :
1. `OutboundTextService` — envoi de texte
2. `InboundPersistenceService` — sauvegarde des messages entrants
3. `MessageStatusService` — mise à jour des statuts
4. `MessageQueryService` — requêtes de lecture

### V3 — URL hardcodée dans un service

```typescript
// whatsapp_message.service.ts
private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;
```

Cette URL devrait être dans `CommunicationWhapiService`, pas dans `WhatsappMessageService`.
De plus `WHAPI_TOKEN` est lu depuis `process.env` directement (ignorer `ConfigService`).

### V4 — Entités utilisées comme DTOs

```typescript
// Dans plusieurs controllers
async create(...): Promise<WhatsappMessage> {  // ← retourne l'entité directement
```

Les entités TypeORM ne devraient jamais être retournées directement par les controllers —
elles exposent la structure interne de la base, incluant les relations lazy non chargées.

### V5 — Pas de validation de sortie

Les DTOs `class-validator` existent pour l'entrée (body des requêtes),
mais aucun DTO de réponse standardisé n'existe pour la sortie.
Résultat : les réponses API sont inconsistantes entre les endpoints.

### V6 — Mixed naming conventions

Le projet mélange :
- Modules en `snake_case` : `whatsapp_message`, `whatsapp_chat`, `whatsapp_commercial`
- Modules en `kebab-case` : `message-auto`, `call-log`, `system-config`
- Modules en `camelCase` : `whapi`, `jorbs`

### V7 — `AppModule` registre des entités

```typescript
// app.module.ts
TypeOrmModule.forFeature([
  WhatsappCommercial,
  WhapiChannel,
  WhatsappChat,
  Admin,
]),
```

Le module racine enregistre des entités qui appartiennent à d'autres modules.
Ces entités devraient être exportées depuis leurs modules respectifs.

### V8 — `process.env` lu directement dans les services

Plusieurs services lisent `process.env.XXX` directement sans passer par `ConfigService`.
Cela rend les services difficiles à tester (impossible de mocker les valeurs).

---

## 5. Points forts à conserver

Ces patterns sont bien conçus et doivent être préservés et étendus :

| Pattern | Fichiers | Pourquoi c'est bien |
|---------|---------|---------------------|
| **Provider Adapter** | `webhooks/adapters/*.adapter.ts` | Normalisation multi-providers sans if/else |
| **Unified Ingress** | `webhooks/unified-ingress.service.ts` | Point d'entrée unique pour tous les providers |
| **Unified Message / Status** | `webhooks/normalization/` | Modèle commun provider-agnostique |
| **Outbound Router** | `communication_whapi/outbound-router.service.ts` | Routing sortant centralisé |
| **WhapiOutboundError** | `errors/whapi-outbound.error.ts` | Erreurs typées avec `permanent`/`transient` |
| **Feature Flags** | `system-config/` | Configuration dynamique sans redémarrage |
| **Idempotency** | `webhooks/idempotency/` | Anti-doublon robuste |
| **Rate Limiting** | `webhook-rate-limit.service.ts` | Protection DDoS |
| **Circuit Breaker** | `webhook-traffic-health.service.ts` | Résilience |
| **Mutex par chat** | `inbound-message.service.ts` | Évite les race conditions |

---

## 6. Architecture cible proposée

### Principe : Hexagonal Architecture (Ports and Adapters)

Adaptée à NestJS, cette architecture définit :
- **Domain** : entités pures, règles métier, events de domaine
- **Application** : use cases (commands + queries), ports (interfaces)
- **Infrastructure** : implémentations des ports (TypeORM, HTTP, WS)
- **Interface** : controllers REST, WebSocket gateway

### Structure cible

```
src/
│
├── domain/                         # ← NOUVEAU : couche domaine pure
│   ├── conversation/
│   │   ├── conversation.entity.ts  # Entité pure (sans TypeORM)
│   │   ├── conversation.repository.interface.ts  # Port (interface)
│   │   └── events/
│   │       ├── conversation-assigned.event.ts
│   │       └── conversation-closed.event.ts
│   ├── message/
│   │   ├── message.entity.ts
│   │   ├── message.repository.interface.ts
│   │   └── value-objects/
│   │       ├── phone-number.vo.ts
│   │       └── message-content.vo.ts
│   ├── agent/
│   │   └── agent.entity.ts
│   └── channel/
│       └── channel.entity.ts
│
├── application/                    # ← NOUVEAU : use cases
│   ├── commands/
│   │   ├── send-text-message/
│   │   │   ├── send-text-message.command.ts
│   │   │   └── send-text-message.handler.ts
│   │   ├── assign-conversation/
│   │   │   ├── assign-conversation.command.ts
│   │   │   └── assign-conversation.handler.ts
│   │   └── mark-message-delivered/
│   │       ├── mark-message-delivered.command.ts
│   │       └── mark-message-delivered.handler.ts
│   ├── queries/
│   │   ├── get-conversation-messages/
│   │   │   ├── get-conversation-messages.query.ts
│   │   │   └── get-conversation-messages.handler.ts
│   │   └── get-conversations-for-agent/
│   │       ├── get-conversations-for-agent.query.ts
│   │       └── get-conversations-for-agent.handler.ts
│   └── event-handlers/
│       ├── on-conversation-assigned.handler.ts
│       └── on-message-received.handler.ts
│
├── infrastructure/                 # ← NOUVEAU : implémentations concrètes
│   ├── persistence/
│   │   ├── typeorm/
│   │   │   ├── entities/           # Entités TypeORM (séparées des entités domaine)
│   │   │   │   ├── message.orm-entity.ts
│   │   │   │   └── conversation.orm-entity.ts
│   │   │   ├── repositories/       # Implémentations des ports
│   │   │   │   ├── conversation.typeorm-repository.ts
│   │   │   │   └── message.typeorm-repository.ts
│   │   │   └── mappers/            # ORM entity ↔ domain entity
│   │   │       ├── conversation.mapper.ts
│   │   │       └── message.mapper.ts
│   │   └── database.module.ts
│   │
│   ├── messaging/                  # Providers sortants
│   │   ├── meta/
│   │   │   └── meta-outbound.adapter.ts
│   │   ├── whapi/
│   │   │   └── whapi-outbound.adapter.ts
│   │   ├── telegram/
│   │   │   └── telegram-outbound.adapter.ts
│   │   └── outbound-provider.interface.ts  # Port
│   │
│   └── realtime/
│       └── socket-io-gateway.ts
│
└── interface/                      # ← NOUVEAU : entrées HTTP + WebSocket
    ├── http/
    │   ├── webhooks/
    │   │   ├── webhook.controller.ts
    │   │   └── adapters/           # (existant — à conserver)
    │   ├── messages/
    │   │   └── messages.controller.ts
    │   └── admin/
    │       └── admin.controller.ts
    └── websocket/
        └── events.gateway.ts
```

### Flux d'un message entrant (cible)

```
Webhook HTTP
    │
    ▼
WebhookController (interface/)
    │  valide signature, taille
    ▼
UnifiedIngressService (infrastructure/messaging/)
    │  adapte le payload → UnifiedMessage
    ▼
CommandBus.execute(HandleInboundMessageCommand)
    │
    ▼
HandleInboundMessageHandler (application/commands/)
    │  contient TOUTE la logique métier :
    │  - vérifier si conversation existe
    │  - assigner agent si besoin
    │  - sauvegarder message via repository port
    │  - déclencher auto-messages si applicable
    │  - émettre ConversationAssigned + MessageReceived events
    ▼
Repositories (infrastructure/persistence/)  ← TypeORM
EventEmitter → Handlers (application/event-handlers/)
    │
    ├── OnMessageReceivedHandler → NotifyAgentViaWebSocket
    └── OnConversationAssignedHandler → UpdateAgentQueue
```

### Avantages de cette architecture cible

| Actuel | Cible |
|--------|-------|
| Services God Object | Use cases focalisés (1 responsabilité) |
| `forwardRef` circulaires | EventBus découple les modules |
| TypeORM dans le domaine | Domaine pur, testable sans DB |
| Pas de séparation lecture/écriture | CQRS léger (Commands + Queries) |
| Dépendances directes entre modules | Ports et adapters (inversés) |
| Tests difficiles (mocks TypeORM) | Tests unitaires sur use cases purs |

---

## 7. Plan de migration progressif

> ⚠️ Il ne faut **pas** tout réécrire d'un coup. La migration doit être incrémentale,
> en préservant le fonctionnement à chaque étape.

### Phase A — Nettoyage immédiat (sans refactoring structurel)
*Durée estimée : 1 semaine*

1. Supprimer l'URL hardcodée `WHAPI_URL` de `WhatsappMessageService` → la déplacer dans `CommunicationWhapiService`
2. Remplacer tous les `process.env.XXX` directs dans les services par `ConfigService`
3. Supprimer les entités de `AppModule.TypeOrmModule.forFeature()` — les enregistrer dans leurs modules
4. Nommer les modules de façon uniforme (choisir `kebab-case` partout)
5. Ajouter des DTOs de réponse (`ResponseDto`) pour ne plus retourner les entités TypeORM directement

### Phase B — Découper le God Object
*Durée estimée : 2 semaines*

1. Découper `WhatsappMessageService` en :
   - `OutboundMessageService` — envois sortants uniquement
   - `InboundPersistenceService` — sauvegarde des entrants uniquement
   - `MessageStatusService` — mise à jour des statuts
   - `MessageQueryService` — requêtes en lecture seule
2. Résoudre les `forwardRef` avec `EventEmitter2` (déjà installé dans NestJS)
   - `DispatcherService` émet `ConversationAssigned`
   - `WhatsappMessageGateway` écoute `ConversationAssigned`
3. Extraire la logique métier du `WhapiController` dans des services

### Phase C — Introduire les interfaces (Ports)
*Durée estimée : 2 semaines*

1. Créer `IConversationRepository` et `IMessageRepository` (interfaces)
2. Renommer les classes TypeORM existantes en `ConversationTypeOrmRepository`
3. Les services dépendent maintenant de l'interface, plus de TypeORM directement
4. Les tests unitaires peuvent utiliser des faux repositories en mémoire

### Phase D — CQRS léger (optionnel, long terme)
*Durée estimée : 3 semaines*

1. Installer `@nestjs/cqrs`
2. Migrer les opérations d'écriture en `Command + CommandHandler`
3. Migrer les opérations de lecture en `Query + QueryHandler`
4. Introduire les événements de domaine pour le découplage inter-modules

### Phase E — Domaine pur (optionnel, très long terme)
*Durée estimée : 4+ semaines*

1. Créer les entités de domaine sans décorateurs TypeORM
2. Créer les mappers ORM entity ↔ domain entity
3. Les use cases travaillent avec les entités domaine pures
4. Les repositories font la conversion

---

## Résumé de l'audit

| Critère | Note actuelle | Note cible |
|---------|--------------|-----------|
| Séparation des couches | 3/10 | 8/10 |
| Single Responsibility | 4/10 | 8/10 |
| Dependency Inversion | 3/10 | 8/10 |
| Testabilité | 4/10 | 9/10 |
| Lisibilité / Navigation | 5/10 | 9/10 |
| Résilience / Patterns | 8/10 | 9/10 |
| Conventions de nommage | 5/10 | 9/10 |

**Verdict** : L'architecture actuelle est fonctionnelle et contient de très bons patterns
(adapters, circuit breaker, idempotence), mais souffre d'un manque de structuration en couches.
La priorité devrait être les Phases A et B — elles apportent le plus de valeur
pour le moins d'effort et sans risque de régression.
Les Phases C, D, E peuvent être envisagées à mesure que le projet grandit.

---

*Référence : Robert C. Martin — Clean Architecture (2017)*
*Référence : NestJS Documentation — CQRS, Hexagonal Architecture*
*Référence : Vaughn Vernon — Implementing Domain-Driven Design (2013)*
