# Cahier des Charges — Refactoring Architecture Backend
## `message_whatsapp/` — Migration vers une Clean Architecture

> **Version** : 1.0
> **Date** : 2026-03-25
> **Basé sur** : `AUDIT_ARCHITECTURE_BACKEND.md`
> **Stack** : NestJS 10, TypeORM 0.3, MySQL 8, Socket.IO, class-validator

---

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Périmètre et hors-périmètre](#2-périmètre-et-hors-périmètre)
3. [Principes directeurs](#3-principes-directeurs)
4. [Phase A — Nettoyage immédiat](#4-phase-a--nettoyage-immédiat)
5. [Phase B — Découper le God Object](#5-phase-b--découper-le-god-object)
6. [Phase C — Interfaces Repository (Ports)](#6-phase-c--interfaces-repository-ports)
7. [Phase D — CQRS léger](#7-phase-d--cqrs-léger)
8. [Phase E — Domaine pur](#8-phase-e--domaine-pur)
9. [Exigences transversales](#9-exigences-transversales)
10. [Critères d'acceptation globaux](#10-critères-dacceptation-globaux)
11. [Conventions et standards](#11-conventions-et-standards)
12. [Livrables par phase](#12-livrables-par-phase)

---

## 1. Contexte et objectifs

### 1.1 Contexte

Le backend `message_whatsapp/` est un serveur NestJS qui gère une plateforme CCaaS
(Contact Center as a Service) multi-providers (Whapi, Meta, Messenger, Instagram, Telegram).

L'audit d'architecture (`AUDIT_ARCHITECTURE_BACKEND.md`) a identifié **8 violations** des
principes de la Clean Architecture, dont 2 considérées comme critiques pour la maintenabilité
et l'évolutivité du projet :

- **V2** — Un service God Object (`WhatsappMessageService`, ~600 lignes, 8 responsabilités)
- **V1** — Des dépendances circulaires résolues via `forwardRef()` (patch, pas une solution)

### 1.2 Objectifs du refactoring

| Objectif | Mesure |
|----------|--------|
| Éliminer toutes les dépendances circulaires (`forwardRef`) | 0 `forwardRef` dans le code |
| Découper le God Object en services à responsabilité unique | ≤ 150 lignes par service |
| Supprimer les URLs et tokens hardcodés dans les services | 0 valeur de config dans les services |
| Introduire des interfaces Repository (ports) | Chaque repository injectable via interface |
| Introduire CQRS pour les opérations critiques | Commands + Handlers pour toutes les écritures |
| Créer un domaine métier pur (sans TypeORM) | Entités domaine sans décorateurs `@Entity` |
| Améliorer la couverture de tests | ≥ 80% couverture sur les use cases |

### 1.3 Contraintes impératives

- **Zéro régression** : chaque phase doit laisser l'application 100% fonctionnelle
- **Migration incrémentale** : les 5 phases sont indépendantes et ordonnées par risque croissant
- **Rétrocompatibilité API** : aucun changement de contrat REST ou WebSocket pendant la migration
- **Tests de non-régression** obligatoires avant toute merge

---

## 2. Périmètre et hors-périmètre

### 2.1 Dans le périmètre

- Tout le code sous `message_whatsapp/src/`
- Fichiers de configuration : `app.module.ts`, `main.ts`
- Fichiers de tests : `**/__tests__/*.spec.ts`

### 2.2 Hors périmètre

- `front/` — interface agents (aucune modification)
- `admin/` — panel admin (aucune modification)
- Base de données : aucune migration de schéma générée par ce refactoring
- API publique (contrats REST et WebSocket inchangés)
- Logique métier (pas de changement fonctionnel, uniquement structurel)

---

## 3. Principes directeurs

### 3.1 Règle fondamentale (Clean Architecture)

```
Les dépendances ne peuvent pointer que vers l'intérieur.
Infrastructure → Application → Domain
```

- Le **domaine** ne connaît pas TypeORM, Express, Socket.IO
- L'**application** (use cases) ne connaît pas TypeORM ni Express
- L'**infrastructure** implémente les interfaces définies par l'application

### 3.2 Règle des responsabilités

Chaque service/handler a **une et une seule raison de changer**.

Indicateurs de violation :
- Un service fait plus de 150 lignes
- Un service importe plus de 5 autres services
- Un service a plus de 3 méthodes publiques très différentes entre elles

### 3.3 Règle du nommage

Convention uniforme : **`kebab-case`** pour tous les noms de fichiers et dossiers.

```
✅ send-text-message.handler.ts
✅ conversation.repository.interface.ts
❌ whatsapp_message.service.ts
❌ whatsappMessage.service.ts
```

### 3.4 Approche de migration

**Strangler Fig Pattern** : on ne supprime pas, on construit à côté et on branche progressivement.
L'ancien code reste opérationnel jusqu'à ce que le nouveau soit testé et validé.

---

## 4. Phase A — Nettoyage immédiat

> **Priorité** : 🔴 Obligatoire avant toute autre phase
> **Risque** : Faible — pas de changement structurel
> **Durée estimée** : 3–5 jours

### 4.1 A1 — Supprimer les valeurs hardcodées

**Problème (V3)** :
```typescript
// whatsapp_message.service.ts — ACTUEL
private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;
```

**Exigences** :

- [ ] Supprimer `WHAPI_URL` de `WhatsappMessageService` — cette URL appartient à `CommunicationWhapiService`
- [ ] Vérifier que `CommunicationWhapiService` utilise déjà `SystemConfigService` ou `ConfigService` pour l'URL — si non, l'y déplacer
- [ ] Identifier **tous** les endroits où `process.env.XXX` est lu directement dans un service
  (utiliser `grep -r "process\.env\." src/ --include="*.ts"`)
- [ ] Remplacer chaque lecture directe par `this.configService.get<string>('KEY')` via injection de `ConfigService`
- [ ] Exception autorisée : `main.ts` et les fichiers de bootstrap uniquement

**Critères d'acceptation A1** :
- `grep -r "process\.env\." src/ --include="*.ts" | grep -v "main.ts" | grep -v ".spec.ts"` retourne 0 résultat
- Tous les services qui lisaient `process.env` directement reçoivent `ConfigService` en injection

---

### 4.2 A2 — Sortir les entités de `AppModule`

**Problème (V7)** :
```typescript
// app.module.ts — ACTUEL
TypeOrmModule.forFeature([WhatsappCommercial, WhapiChannel, WhatsappChat, Admin]),
```

**Exigences** :

- [ ] Supprimer `TypeOrmModule.forFeature([...])` du `AppModule` racine
- [ ] Vérifier que chaque entité concernée est déjà enregistrée dans son module propre :
  - `WhatsappCommercial` → `WhatsappCommercialModule`
  - `WhapiChannel` → `ChannelModule`
  - `WhatsappChat` → `WhatsappChatModule`
  - `Admin` → `AdminModule`
- [ ] Si un module qui utilise ces entités ne les importe pas, ajouter les imports `TypeOrmModule.forFeature()` manquants dans les modules concernés
- [ ] Exporter les repositories depuis les modules concernés si nécessaire pour les modules dépendants

**Critères d'acceptation A2** :
- `app.module.ts` ne contient plus aucun appel `TypeOrmModule.forFeature()`
- L'application démarre sans erreur après la modification
- Aucune injection `@InjectRepository()` n'est cassée

---

### 4.3 A3 — Uniformiser les noms de modules

**Problème (V6)** :
```
whatsapp_message/  ← snake_case
message-auto/      ← kebab-case
whapi/             ← sans tiret
jorbs/             ← faute de frappe de "jobs"
```

**Exigences** :

- [ ] Renommer tous les dossiers/modules selon la convention `kebab-case`
  | Actuel | Cible |
  |--------|-------|
  | `whatsapp_message/` | `whatsapp-message/` |
  | `whatsapp_chat/` | `whatsapp-chat/` |
  | `whatsapp_commercial/` | `whatsapp-commercial/` |
  | `whatsapp_poste/` | `whatsapp-poste/` |
  | `whatsapp_contacts/` | `whatsapp-contacts/` |
  | `whatsapp_customer/` | `whatsapp-customer/` |
  | `whatsapp_media/` | `whatsapp-media/` |
  | `whatsapp_error/` | `whatsapp-error/` |
  | `whatsapp_button/` | `whatsapp-button/` |
  | `whatsapp_last_message/` | `whatsapp-last-message/` |
  | `whatsapp_message_content/` | `whatsapp-message-content/` |
  | `whatsapp_chat_label/` | `whatsapp-chat-label/` |
  | `jorbs/` | `jobs/` |
  | `communication_whapi/` | `outbound/` |
- [ ] Mettre à jour tous les imports après renommage
- [ ] Mettre à jour `tsconfig.json` si des paths aliases pointent vers les anciens noms

**Critères d'acceptation A3** :
- Aucun dossier sous `src/` ne contient de `_` (underscore) dans son nom
- `npm run build` passe sans erreur
- `npm run start:dev` démarre sans erreur

---

### 4.4 A4 — Ajouter les DTOs de réponse

**Problème (V4 + V5)** :
```typescript
// Actuel — retourne l'entité TypeORM directement
async findOne(id: string): Promise<WhatsappMessage> {
```

**Exigences** :

- [ ] Créer un dossier `dto/response/` dans chaque module qui expose une API REST
- [ ] Créer au minimum les DTOs de réponse suivants :
  - `MessageResponseDto` — pour les endpoints de messages
  - `ConversationResponseDto` — pour les endpoints de conversations
  - `ChannelResponseDto` — pour les endpoints de canaux
- [ ] Structure minimale d'un DTO de réponse :
  ```typescript
  export class MessageResponseDto {
    id: string;
    content: string;
    status: string;
    direction: string;
    createdAt: Date;
    // Jamais de relations lazy non chargées
    // Jamais de champs internes (error_code raw, etc.)
  }
  ```
- [ ] Utiliser `class-transformer` (`@Exclude()`, `@Expose()`) pour contrôler la sérialisation
- [ ] Activer `ClassSerializerInterceptor` globalement dans `main.ts`
- [ ] Les controllers retournent les DTOs, pas les entités directement

**Critères d'acceptation A4** :
- Aucun controller ne retourne un type `Promise<EntityClass>` directement
- Les réponses ne contiennent pas de champs non définis dans les DTOs (pas de fuite de structure interne)

---

## 5. Phase B — Découper le God Object

> **Priorité** : 🔴 Hautement recommandée
> **Risque** : Moyen — modification de services critiques
> **Durée estimée** : 8–12 jours
> **Prérequis** : Phase A complétée

### 5.1 B1 — Découpage de `WhatsappMessageService`

**Problème (V2)** : `WhatsappMessageService` (~600 lignes) cumule 8 responsabilités distinctes.

**Architecture cible** :

```
whatsapp-message/
├── services/
│   ├── outbound-message.service.ts     ← envois sortants (texte + média)
│   ├── inbound-persistence.service.ts  ← sauvegarde des messages entrants
│   ├── message-status.service.ts       ← mise à jour des statuts SENT/DELIVERED/READ
│   └── message-query.service.ts        ← requêtes en lecture (findById, findByChatId...)
└── whatsapp-message.service.ts         ← façade (optionnel, pour compatibilité)
```

#### B1.1 — `OutboundMessageService`

Responsabilité unique : **envoyer un message vers un provider**.

**Exigences** :
- [ ] Extraire de `WhatsappMessageService` toutes les méthodes qui appellent un provider externe (Whapi, Meta, etc.)
- [ ] `OutboundMessageService` reçoit en injection `OutboundRouterService` uniquement
- [ ] `OutboundMessageService` ne touche pas directement la base de données
- [ ] Signature de la méthode principale :
  ```typescript
  async sendText(params: {
    chatId: string;
    text: string;
    channelId: string;
    replyToMessageId?: string;
  }): Promise<{ providerMessageId: string }>;
  ```
- [ ] `OutboundMessageService` déclenche un événement `MessageSentEvent` via `EventEmitter2` après envoi réussi

#### B1.2 — `InboundPersistenceService`

Responsabilité unique : **sauvegarder un message entrant en base**.

**Exigences** :
- [ ] Extraire de `WhatsappMessageService` toutes les méthodes de sauvegarde de messages entrants
- [ ] `InboundPersistenceService` reçoit uniquement le repository `WhatsappMessage` en injection
- [ ] Aucun appel réseau dans ce service
- [ ] Signature principale :
  ```typescript
  async persist(message: {
    chatId: string;
    providerMessageId: string;
    content: string;
    type: string;
    direction: 'inbound' | 'outbound';
    timestamp: Date;
    raw?: object;
  }): Promise<WhatsappMessage>;
  ```

#### B1.3 — `MessageStatusService`

Responsabilité unique : **mettre à jour le statut d'un message** (sent → delivered → read → failed).

**Exigences** :
- [ ] Extraire de `WhatsappMessageService` toutes les méthodes de mise à jour de statut
- [ ] Exposer `updateStatus(providerMessageId: string, status: WhatsappMessageStatus, errorCode?: string): Promise<void>`
- [ ] Si le statut est `FAILED`, déclencher un événement `MessageFailedEvent` avec le code d'erreur
- [ ] Si le statut passe à `READ`, déclencher un événement `MessageReadEvent`

#### B1.4 — `MessageQueryService`

Responsabilité unique : **lire des messages** sans modification.

**Exigences** :
- [ ] Extraire toutes les méthodes de lecture (`find*`, `get*`)
- [ ] Ce service est en lecture seule — aucun `save()`, `update()`, `delete()`
- [ ] Documenter chaque méthode avec un commentaire JSDoc minimal indiquant le critère de requête

#### B1.5 — Façade optionnelle

Si des modules tiers importent `WhatsappMessageService` et qu'il est trop coûteux de les migrer simultanément :
- [ ] Renommer l'ancien `WhatsappMessageService` en `WhatsappMessageFacade`
- [ ] `WhatsappMessageFacade` délègue à chacun des 4 nouveaux services
- [ ] Marquer `WhatsappMessageFacade` avec un commentaire `@deprecated` et une date de suppression planifiée

---

### 5.2 B2 — Résoudre les dépendances circulaires (forwardRef)

**Problème (V1)** :
```typescript
// dispatcher.service.ts
@Inject(forwardRef(() => WhatsappMessageGateway))
private readonly messageGateway: WhatsappMessageGateway,
```

**Cause racine** : `DispatcherService` doit notifier les agents en WebSocket après dispatch,
et `WhatsappMessageGateway` a besoin du dispatcher. Couplage bidirectionnel → cercle.

**Solution** : Découplage via `EventEmitter2` (déjà disponible dans NestJS).

**Exigences** :

- [ ] Installer/vérifier `@nestjs/event-emitter` dans `package.json`
- [ ] Enregistrer `EventEmitterModule.forRoot()` dans `AppModule`
- [ ] Définir les événements dans un fichier central `src/events/events.constants.ts` :
  ```typescript
  export const EVENTS = {
    CONVERSATION_ASSIGNED: 'conversation.assigned',
    CONVERSATION_REASSIGNED: 'conversation.reassigned',
    CONVERSATION_REMOVED: 'conversation.removed',
    MESSAGE_RECEIVED: 'message.received',
    MESSAGE_SENT: 'message.sent',
    MESSAGE_STATUS_UPDATED: 'message.status.updated',
  } as const;
  ```
- [ ] Dans `DispatcherService` : remplacer les appels directs à `messageGateway.*` par `this.eventEmitter.emit(EVENTS.CONVERSATION_ASSIGNED, payload)`
- [ ] Dans `WhatsappMessageGateway` : ajouter des `@OnEvent(EVENTS.CONVERSATION_ASSIGNED)` pour réagir aux événements
- [ ] Supprimer tous les `forwardRef()` une fois les événements en place
- [ ] Vérifier qu'aucun `forwardRef` ne subsiste : `grep -r "forwardRef" src/ --include="*.ts"` → 0 résultat

**Définition des payloads d'événements** :
```typescript
// src/events/payloads/conversation-assigned.payload.ts
export interface ConversationAssignedPayload {
  chatId: string;
  posteId: string;
  conversationId: number;
  isNew: boolean;
}

// src/events/payloads/conversation-reassigned.payload.ts
export interface ConversationReassignedPayload {
  chatId: string;
  oldPosteId: string;
  newPosteId: string;
}
```

**Critères d'acceptation B2** :
- `grep -r "forwardRef" src/ --include="*.ts"` → 0 résultat
- Les notifications WebSocket fonctionnent exactement comme avant (tests E2E)
- Les événements sont loggés en mode `debug` pour traçabilité

---

### 5.3 B3 — Extraire la logique du `WhapiController`

**Problème** : Le controller gère signature HMAC, rate limiting, circuit breaker, idempotence,
et décision de routing — trop de responsabilités pour un controller.

**Exigences** :

- [ ] Créer `WebhookMiddlewarePipeline` ou utiliser des `Guards` NestJS distincts pour :
  - Validation de signature HMAC → `HmacSignatureGuard`
  - Rate limiting → `WebhookRateLimitGuard` (déjà existe partiellement)
  - Circuit breaker → `CircuitBreakerGuard`
- [ ] La logique "faut-il réprocesser ce duplicat ?" → extraire dans `IdempotencyService.shouldProcess()`
- [ ] Le controller lui-même se limite à : recevoir le body, appeler `UnifiedIngressService`, retourner 200

**Critères d'acceptation B3** :
- Le controller fait ≤ 50 lignes
- Chaque Guard est testable indépendamment

---

## 6. Phase C — Interfaces Repository (Ports)

> **Priorité** : 🟠 Recommandée pour la testabilité
> **Risque** : Moyen — affecte les injections de dépendances
> **Durée estimée** : 8–10 jours
> **Prérequis** : Phase B complétée

### 6.1 C1 — Définir les interfaces (ports)

**Principe** : Les services de l'application ne connaissent que l'interface, pas TypeORM.

**Exigences** :

- [ ] Créer un dossier `src/domain/repositories/` (ou `src/ports/repositories/`)
- [ ] Créer les interfaces suivantes :

```typescript
// src/domain/repositories/i-message.repository.ts
export interface IMessageRepository {
  findById(id: string): Promise<WhatsappMessage | null>;
  findByProviderMessageId(providerMessageId: string): Promise<WhatsappMessage | null>;
  findByChatId(chatId: string, options?: PaginationOptions): Promise<WhatsappMessage[]>;
  save(message: Partial<WhatsappMessage>): Promise<WhatsappMessage>;
  updateStatus(providerMessageId: string, status: WhatsappMessageStatus): Promise<void>;
}
```

```typescript
// src/domain/repositories/i-conversation.repository.ts
export interface IConversationRepository {
  findByChatId(chatId: string): Promise<WhatsappChat | null>;
  findByPosteId(posteId: string): Promise<WhatsappChat[]>;
  findWaiting(): Promise<WhatsappChat[]>;
  save(conversation: Partial<WhatsappChat>): Promise<WhatsappChat>;
  updateStatus(chatId: string, status: WhatsappChatStatus): Promise<void>;
}
```

```typescript
// src/domain/repositories/i-channel.repository.ts
export interface IChannelRepository {
  findById(id: string): Promise<WhapiChannel | null>;
  findByProvider(provider: string): Promise<WhapiChannel[]>;
  findAll(): Promise<WhapiChannel[]>;
}
```

- [ ] Créer des tokens d'injection pour chaque interface :
  ```typescript
  // src/domain/repositories/repository.tokens.ts
  export const MESSAGE_REPOSITORY = Symbol('IMessageRepository');
  export const CONVERSATION_REPOSITORY = Symbol('IConversationRepository');
  export const CHANNEL_REPOSITORY = Symbol('IChannelRepository');
  ```

---

### 6.2 C2 — Implémenter les repositories TypeORM

**Exigences** :

- [ ] Créer `src/infrastructure/persistence/typeorm/` si ce dossier n'existe pas
- [ ] Pour chaque interface, créer une classe d'implémentation TypeORM :
  ```
  message.typeorm-repository.ts     ← implémente IMessageRepository
  conversation.typeorm-repository.ts ← implémente IConversationRepository
  channel.typeorm-repository.ts      ← implémente IChannelRepository
  ```
- [ ] Chaque classe d'implémentation reçoit `@InjectRepository(XEntity)` en injection
- [ ] Enregistrer les providers dans les modules respectifs :
  ```typescript
  {
    provide: MESSAGE_REPOSITORY,
    useClass: MessageTypeOrmRepository,
  }
  ```

---

### 6.3 C3 — Migrer les services vers les interfaces

**Exigences** :

- [ ] Remplacer les injections `@InjectRepository(WhatsappMessage)` par `@Inject(MESSAGE_REPOSITORY)`
- [ ] Le type de la propriété devient `IMessageRepository` (interface) au lieu de `Repository<WhatsappMessage>`
- [ ] Vérifier que les services qui utilisent des QueryBuilder TypeORM complexes sont traités séparément :
  - Si la query est simple : encapsuler dans une méthode de l'interface
  - Si la query est trop spécifique : créer une méthode dédiée sur l'interface (ex: `findOverdueConversations()`)
- [ ] Aucun service en dehors de l'infrastructure ne doit importer `Repository` de TypeORM

**Critères d'acceptation C3** :
- `grep -r "Repository<" src/ --include="*.ts" | grep -v "infrastructure" | grep -v ".spec.ts"` → 0 résultat
- Les tests unitaires utilisent des faux repositories en mémoire (pas de TypeORM en test unitaire)

---

### 6.4 C4 — Écrire les tests unitaires avec faux repositories

**Exigences** :

- [ ] Créer `src/test-utils/repositories/in-memory-message.repository.ts`
- [ ] Créer `src/test-utils/repositories/in-memory-conversation.repository.ts`
- [ ] Ces classes implémentent les mêmes interfaces et stockent les données en `Map<string, Entity>`
- [ ] Écrire des tests unitaires pour au moins :
  - `OutboundMessageService` (mock du router, vérifier l'événement émis)
  - `InboundPersistenceService` (faux repository, vérifier la sauvegarde)
  - `MessageStatusService` (faux repository, vérifier les événements émis)
  - `DispatcherService` (faux repository, vérifier les événements émis)

**Critères d'acceptation C4** :
- Couverture ≥ 70% sur les services nouvellement découpés
- Les tests unitaires s'exécutent sans connexion DB (pas de `@InjectRepository` TypeORM dans les tests)

---

## 7. Phase D — CQRS léger

> **Priorité** : 🟡 Optionnel — apporte structure mais pas critique
> **Risque** : Faible — additionnel sur l'existant
> **Durée estimée** : 10–15 jours
> **Prérequis** : Phase C complétée

### 7.1 D1 — Installation et configuration

**Exigences** :

- [ ] Installer `@nestjs/cqrs` : `npm install @nestjs/cqrs`
- [ ] Enregistrer `CqrsModule` dans les modules concernés
- [ ] Ne pas enregistrer `CqrsModule` globalement — uniquement dans les modules qui en ont besoin

---

### 7.2 D2 — Migrer les opérations critiques en Commands

**Commandes prioritaires** :

| Command | Handler | Déclencheur |
|---------|---------|-------------|
| `SendTextMessageCommand` | `SendTextMessageHandler` | `MessagesController.create()` |
| `AssignConversationCommand` | `AssignConversationHandler` | `UnifiedIngressService.handleMessages()` |
| `HandleInboundMessageCommand` | `HandleInboundMessageHandler` | `UnifiedIngressService.handleMessages()` |
| `UpdateMessageStatusCommand` | `UpdateMessageStatusHandler` | `UnifiedIngressService.handleStatuses()` |
| `TransferConversationCommand` | `TransferConversationHandler` | `ConversationsController.transfer()` |

**Structure d'une Command** :
```typescript
// application/commands/send-text-message/send-text-message.command.ts
export class SendTextMessageCommand {
  constructor(
    public readonly chatId: string,
    public readonly text: string,
    public readonly channelId: string,
    public readonly replyToMessageId?: string,
  ) {}
}

// application/commands/send-text-message/send-text-message.handler.ts
@CommandHandler(SendTextMessageCommand)
export class SendTextMessageHandler implements ICommandHandler<SendTextMessageCommand> {
  constructor(
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepo: IMessageRepository,
    @Inject(CHANNEL_REPOSITORY) private readonly channelRepo: IChannelRepository,
    private readonly outboundRouter: OutboundRouterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: SendTextMessageCommand): Promise<void> {
    // Logique de l'use case ici
  }
}
```

**Exigences générales** :
- [ ] Chaque `CommandHandler` a une seule méthode `execute()`
- [ ] Chaque `CommandHandler` est testé indépendamment avec des faux repositories
- [ ] Les `CommandHandler` ne retournent pas de données métier complexes (max: un ID)
  — les données sont récupérées via des Queries séparées
- [ ] Conserver un log structuré en début de chaque handler :
  ```typescript
  this.logger.log(`CMD:SendTextMessage chatId=${command.chatId}`);
  ```

---

### 7.3 D3 — Migrer les lectures en Queries

**Queries prioritaires** :

| Query | Handler | Utilisé par |
|-------|---------|-------------|
| `GetMessagesForChatQuery` | `GetMessagesForChatHandler` | `MessagesController.findByChatId()` |
| `GetConversationsForAgentQuery` | `GetConversationsForAgentHandler` | `WhatsappChatController.findByPoste()` |
| `GetDispatchSnapshotQuery` | `GetDispatchSnapshotHandler` | `DispatcherController.snapshot()` |

**Exigences** :
- [ ] Les Query Handlers ne modifient jamais l'état (aucun `save()`, `update()`)
- [ ] Les Query Handlers peuvent retourner des DTOs directement (pas les entités de domaine)
- [ ] Les Query Handlers optimisent les lectures : utiliser `SELECT` ciblés, pas de chargement de toutes les relations

---

### 7.4 D4 — Événements de domaine via CQRS

**Exigences** :

- [ ] Migrer les événements définis en phase B (`EventEmitter2`) vers `IEvent` CQRS pour les événements critiques :
  - `ConversationAssignedEvent`
  - `MessageReceivedEvent`
  - `MessageStatusUpdatedEvent`
- [ ] Conserver `EventEmitter2` pour les événements non-critiques / cross-module (notifications, logging)
- [ ] Les `EventHandler` CQRS sont responsables uniquement des effets de bord dans leur module

---

## 8. Phase E — Domaine pur

> **Priorité** : 🟢 Long terme — différenciation architecturale
> **Risque** : Élevé — impact sur toutes les couches
> **Durée estimée** : 4–6 semaines
> **Prérequis** : Phase D complétée

### 8.1 E1 — Créer la couche domaine

**Exigences** :

- [ ] Créer `src/domain/` avec la structure suivante :
  ```
  src/domain/
  ├── conversation/
  │   ├── conversation.entity.ts         ← entité pure (pas de @Entity TypeORM)
  │   ├── conversation-status.enum.ts
  │   └── conversation.repository.interface.ts
  ├── message/
  │   ├── message.entity.ts
  │   ├── message-status.enum.ts
  │   ├── message-direction.enum.ts
  │   └── message.repository.interface.ts
  ├── agent/
  │   ├── agent.entity.ts
  │   └── agent.repository.interface.ts
  └── channel/
      ├── channel.entity.ts
      └── channel.repository.interface.ts
  ```
- [ ] Les entités de domaine sont des classes TypeScript pures :
  - Pas de décorateurs `@Entity`, `@Column`, `@PrimaryGeneratedColumn`
  - Constructeur avec paramètres typés
  - Méthodes métier encapsulées (ex: `conversation.close()`, `message.markAsRead()`)
  - Peuvent lever des erreurs de domaine (ex: `throw new DomainError('Cannot modify sent message')`)

**Exemple d'entité de domaine** :
```typescript
// src/domain/message/message.entity.ts
export class Message {
  private constructor(
    public readonly id: string,
    public readonly chatId: string,
    public readonly content: string,
    private _status: MessageStatus,
    public readonly direction: MessageDirection,
    public readonly createdAt: Date,
  ) {}

  static create(params: CreateMessageParams): Message {
    // Règles de création
    return new Message(params.id, params.chatId, params.content,
      MessageStatus.PENDING, params.direction, new Date());
  }

  get status(): MessageStatus {
    return this._status;
  }

  markAsDelivered(): void {
    if (this._status === MessageStatus.READ) {
      throw new DomainError('Cannot downgrade status from READ to DELIVERED');
    }
    this._status = MessageStatus.DELIVERED;
  }
}
```

---

### 8.2 E2 — Value Objects

**Exigences** :

- [ ] Créer `src/domain/shared/value-objects/` avec :
  - `phone-number.vo.ts` — valide format E.164, normalise les préfixes
  - `message-content.vo.ts` — valide longueur, encode les caractères spéciaux
  - `provider-message-id.vo.ts` — wraps l'identifiant opaque des providers
- [ ] Les Value Objects sont **immutables** (toutes les propriétés `readonly`)
- [ ] Les Value Objects ont une méthode `equals()` pour comparaison par valeur

---

### 8.3 E3 — Mappers ORM ↔ Domaine

**Exigences** :

- [ ] Créer `src/infrastructure/persistence/typeorm/mappers/` avec :
  - `message.mapper.ts`
  - `conversation.mapper.ts`
  - `channel.mapper.ts`
- [ ] Chaque mapper a deux méthodes statiques :
  ```typescript
  static toDomain(ormEntity: MessageOrmEntity): Message
  static toOrm(domainEntity: Message): MessageOrmEntity
  ```
- [ ] Les repositories TypeORM utilisent les mappers pour convertir avant de retourner

---

### 8.4 E4 — Entités ORM séparées

**Exigences** :

- [ ] Renommer les entités TypeORM actuelles en `*.orm-entity.ts`
  (ex: `whatsapp_message.entity.ts` → `message.orm-entity.ts`)
- [ ] Ces fichiers restent dans `infrastructure/persistence/typeorm/entities/`
- [ ] Les entités ORM **ne sont jamais importées** en dehors de la couche infrastructure
- [ ] Les colonnes DB restent inchangées (pas de migration SQL générée par cette étape)

---

## 9. Exigences transversales

### 9.1 Logging

- [ ] Chaque service, handler, et guard utilise `new Logger(ClassName.name)` pour le logger
- [ ] Format de log structuré : `ACTION:SubAction param1=val1 param2=val2`
- [ ] Les opérations critiques (dispatch, envoi, statut) sont loggées en `log` (pas `debug`)
- [ ] Les opérations fréquentes mais non-critiques (cache hit, tick) en `debug`
- [ ] Les erreurs récupérables en `warn`, les erreurs fatales en `error`

### 9.2 Gestion des erreurs

- [ ] Créer `src/common/errors/domain.error.ts` : classe de base pour les erreurs métier
- [ ] Créer `src/common/errors/infrastructure.error.ts` : erreurs techniques
- [ ] Créer un `GlobalExceptionFilter` dans `src/common/filters/` qui :
  - Mappe `DomainError` → HTTP 422 (Unprocessable Entity)
  - Mappe les erreurs de validation class-validator → HTTP 400
  - Mappe les erreurs inconnues → HTTP 500 avec log `error`
  - Ne laisse jamais fuiter les stack traces en production

### 9.3 Tests

| Type | Outil | Couverture cible |
|------|-------|-----------------|
| Tests unitaires | Jest | ≥ 80% sur les services découpés (phases B, C) |
| Tests unitaires | Jest | ≥ 70% sur les command/query handlers (phase D) |
| Tests d'intégration | Jest + TypeORM in-memory ou test DB | Flux complet entrant + sortant |
| Tests E2E | Supertest | Contrats API REST (avant = après refactoring) |

**Règle** : aucune PR de refactoring ne peut être mergée sans tests de non-régression.

### 9.4 Migration de la base de données

- [ ] Le refactoring architectural **ne génère aucune migration SQL**
- [ ] Si un renommage de colonne est nécessaire pour la cohérence, il est traité dans un ticket séparé
- [ ] Les entités ORM conservent les noms de colonnes SQL actuels (`name: 'created_at'`)

### 9.5 Documentation inline

- [ ] Chaque interface (port) est documentée avec JSDoc : description de la méthode + paramètres
- [ ] Chaque Command et Query est documentée avec un commentaire expliquant son déclencheur
- [ ] Les décisions d'architecture significatives sont notées dans un fichier `src/ARCHITECTURE.md`

---

## 10. Critères d'acceptation globaux

### Phase A — Done when :

- [ ] `grep -r "process\.env\." src/ --include="*.ts" | grep -v "main.ts"` → 0 résultat
- [ ] `app.module.ts` ne contient pas `TypeOrmModule.forFeature`
- [ ] Aucun dossier sous `src/` n'a de `_` dans son nom
- [ ] `npm run build` passe sans warning TypeScript
- [ ] `npm run test` passe sans régression

### Phase B — Done when :

- [ ] `grep -r "forwardRef" src/ --include="*.ts"` → 0 résultat
- [ ] `WhatsappMessageService` (ou sa façade) fait ≤ 150 lignes
- [ ] Chaque nouveau service (outbound, inbound, status, query) est testé unitairement
- [ ] Le comportement WebSocket est identique avant/après (testé manuellement ou via E2E)

### Phase C — Done when :

- [ ] `grep -r "Repository<" src/ --include="*.ts" | grep -v "infrastructure" | grep -v ".spec.ts"` → 0 résultat
- [ ] Tests unitaires s'exécutent sans connexion DB
- [ ] Couverture ≥ 70% sur les services modifiés

### Phase D — Done when :

- [ ] Toutes les opérations d'écriture critiques passent par un `CommandHandler`
- [ ] Toutes les lectures fréquentes passent par un `QueryHandler`
- [ ] Les `CommandHandler` sont testés avec des faux repositories

### Phase E — Done when :

- [ ] Aucune entité de domaine ne contient de décorateur TypeORM
- [ ] Les mappers sont testés (domaine → ORM et ORM → domaine)
- [ ] Couverture globale ≥ 80%

---

## 11. Conventions et standards

### 11.1 Nommage des fichiers

```
Entities domaine    : <nom>.entity.ts
Entities ORM        : <nom>.orm-entity.ts
Interfaces ports    : i-<nom>.repository.ts
Repositories TypeORM: <nom>.typeorm-repository.ts
Commands            : <verb>-<noun>.command.ts
Query               : get-<noun>.query.ts
Handlers            : <command-or-query-name>.handler.ts
Events              : <noun>-<past-verb>.event.ts
DTOs entrée         : create-<nom>.dto.ts / update-<nom>.dto.ts
DTOs sortie         : <nom>.response.dto.ts
Mappers             : <nom>.mapper.ts
Guards              : <nom>.guard.ts
Filters             : <nom>.filter.ts
```

### 11.2 Structure de module (cible)

```
<module-name>/
├── domain/
│   ├── <entity>.entity.ts
│   └── i-<entity>.repository.ts
├── application/
│   ├── commands/
│   │   └── <command>/
│   │       ├── <command>.command.ts
│   │       └── <command>.handler.ts
│   └── queries/
│       └── <query>/
│           ├── <query>.query.ts
│           └── <query>.handler.ts
├── infrastructure/
│   ├── <entity>.orm-entity.ts
│   ├── <entity>.typeorm-repository.ts
│   └── <entity>.mapper.ts
├── interface/
│   ├── <module>.controller.ts
│   └── dto/
│       ├── create-<entity>.dto.ts
│       └── <entity>.response.dto.ts
└── <module>.module.ts
```

### 11.3 Conventions d'import

- Les imports internes utilisent des chemins relatifs (`../`)
- Les imports cross-modules utilisent les path aliases TypeScript (`@module/...`)
- L'ordre des imports dans chaque fichier :
  1. NestJS / Node.js
  2. Packages npm tiers
  3. Imports internes (`@module/...`)
  4. Imports relatifs (`../`)

---

## 12. Livrables par phase

### Phase A

| Livrable | Description |
|----------|-------------|
| `src/` refactorisé | Toutes les corrections A1–A4 appliquées |
| Tests de non-régression | `npm run test` passe à 100% |
| PR descriptive | Description des changements + checklist |

### Phase B

| Livrable | Description |
|----------|-------------|
| `src/whatsapp-message/services/` | 4 nouveaux services découpés |
| `src/events/` | Constants d'événements + payloads typés |
| Tests unitaires | Pour chacun des 4 nouveaux services |
| Migration de 0 `forwardRef` | Prouvée par grep |

### Phase C

| Livrable | Description |
|----------|-------------|
| `src/domain/repositories/` | Interfaces et tokens d'injection |
| `src/infrastructure/persistence/typeorm/repositories/` | Implémentations TypeORM |
| `src/test-utils/repositories/` | Faux repositories en mémoire |
| Tests unitaires | Sans connexion DB |

### Phase D

| Livrable | Description |
|----------|-------------|
| `src/application/commands/` | Commands + Handlers prioritaires |
| `src/application/queries/` | Queries + Handlers prioritaires |
| `src/application/event-handlers/` | Handlers d'événements domaine |
| Tests unitaires | Pour chaque Handler |

### Phase E

| Livrable | Description |
|----------|-------------|
| `src/domain/` | Entités pures, Value Objects |
| `src/infrastructure/persistence/typeorm/mappers/` | Mappers ORM ↔ Domaine |
| `src/ARCHITECTURE.md` | Document d'architecture de référence |
| Rapport de couverture | ≥ 80% sur les couches application et domaine |

---

## Annexe A — Checklist de démarrage de phase

Avant de commencer une phase :

- [ ] La phase précédente est complètement mergée sur la branche principale
- [ ] `npm run test` passe à 100%
- [ ] `npm run build` passe sans erreur ni warning TypeScript
- [ ] Une branche feature dédiée est créée : `feature/arch-phase-X`
- [ ] Le présent cahier des charges est relu pour la phase concernée

---

## Annexe B — Commandes de vérification utiles

```bash
# Vérifier les process.env directs hors main.ts
grep -r "process\.env\." src/ --include="*.ts" | grep -v "main.ts" | grep -v ".spec.ts"

# Vérifier les forwardRef restants
grep -r "forwardRef" src/ --include="*.ts"

# Vérifier les Repository<> TypeORM hors infrastructure
grep -r "Repository<" src/ --include="*.ts" | grep -v "infrastructure" | grep -v ".spec.ts"

# Vérifier les noms de dossiers avec underscore
find src/ -type d -name "*_*"

# Compter les lignes des services (repérer les God Objects)
wc -l src/**/*.service.ts | sort -rn | head -20

# Vérifier la couverture de tests
npm run test:cov
```

---

*Basé sur : `AUDIT_ARCHITECTURE_BACKEND.md` (2026-03-25)*
*Référence : Robert C. Martin — Clean Architecture (2017)*
*Référence : NestJS Documentation — CQRS, Modules, Providers*
