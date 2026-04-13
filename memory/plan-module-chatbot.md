# Plan de création — Module Chatbot (FlowBot)

> **Date :** 2026-04-13  
> **Objectif final :** Remplacement **complet** de `auto-message-master` + `AutoMessageOrchestrator`  
> **Périmètre :** Tous les cas A–I + mode séquence legacy migrés vers FlowBot  
> **Principe d'architecture :** FlowBot est **indépendant** de `whatsapp_chat` et `whatsapp_message` — il possède ses propres entités et communique via des interfaces et des événements  
> **Compatibilité providers :** Compatible avec **tous les providers présents et futurs** (Whapi, Meta, Telegram, Email, SMS…) via le pattern `ProviderAdapter` indexé par provider — pas par canal  
> **Inspiration :** Intercom, Zendesk, HubSpot, Crisp  
> **Contrainte :** Sans IA/NLU — logique conditionnelle basée sur règles

---

## Table des matières

1. [Principe fondamental — Découplage](#1-principe-fondamental--découplage)
2. [Vue d'ensemble de l'architecture](#2-vue-densemble-de-larchitecture)
3. [Entités propres au FlowBot](#3-entités-propres-au-flowbot)
4. [Interface ChannelAdapter](#4-interface-channeladapter)
5. [Communication événementielle](#5-communication-événementielle)
6. [Concepts métier (Flow, Nœud, Session…)](#6-concepts-métier)
7. [Schéma de base de données — FlowBot uniquement](#7-schéma-de-base-de-données)
8. [Structure du module NestJS](#8-structure-du-module-nestjs)
9. [Moteur d'exécution](#9-moteur-dexécution)
10. [Panel admin — Frontend](#10-panel-admin--frontend)
11. [Remplacement complet — Mapping A–I + séquence](#11-remplacement-complet--mapping-ai--séquence)
12. [Phases d'implémentation](#12-phases-dimplémentation)
13. [Risques et points d'attention](#13-risques-et-points-dattention)
14. [APIs exposées](#14-apis-exposées)

---

## 1. Principe fondamental — Découplage & universalité providers

### Le problème du couplage fort actuel

`auto-message-master` et `AutoMessageOrchestrator` dépendent directement de :
- `WhatsappChat` (entité TypeORM) → lecture du statut, poste_id, timestamps
- `WhatsappMessageService` → envoi de messages
- `DispatcherService` → assignation d'agents
- `WhatsappMessageGateway` → émissions Socket.io

Ce couplage signifie que **le chatbot ne peut fonctionner que sur WhatsApp via Whapi**. Ajouter Meta, Telegram ou Email obligerait à réécrire tout le moteur.

### La distinction canal vs provider — point clé

> Un **canal** est la plateforme de communication (WhatsApp, Telegram, Email).  
> Un **provider** est l'API technique qui donne accès à ce canal (Whapi, Meta WABA, Telegram Bot API, SendGrid).

Deux providers peuvent servir le même canal :

| Canal | Provider actuel | Provider futur |
|-------|-----------------|----------------|
| WhatsApp | `whapi` | `meta` (déjà en place), `360dialog`, `bird` |
| Telegram | — | `telegram_bot` |
| Email | — | `sendgrid`, `mailgun`, `smtp` |
| SMS | — | `twilio`, `vonage` |
| Web chat | — | `widget_native` |

**⚠️ Indexer l'adaptateur par `channelType` serait une erreur** : Whapi et Meta sont deux providers différents pour WhatsApp — chacun a son propre format d'API, ses propres endpoints, ses propres contraintes (fenêtre 24h Meta, format HSM, etc.).

### La règle d'architecture du FlowBot

> **Le module `flowbot` ne doit jamais importer depuis `whatsapp_chat`, `whatsapp_message`, `dispatcher` ou tout module provider-spécifique.**

Le FlowBot :
1. **Possède ses propres entités** — `bot_conversation`, `bot_message`
2. **Parle à un `ProviderAdapter`** — une interface indexée par `provider` (pas par canal)
3. **Écoute et émet des événements** via `EventEmitter2` — jamais d'import direct

### Ce que ça permet

```
FlowBot (logique pure — zéro import provider)
        │
        │  ProviderAdapterRegistry.get('whapi')
        ├── WhapiProviderAdapter      → Whapi REST API (actuel)
        │
        │  ProviderAdapterRegistry.get('meta')
        ├── MetaProviderAdapter       → Meta Graph API (actuel)
        │
        │  ProviderAdapterRegistry.get('telegram_bot')   [futur]
        ├── TelegramProviderAdapter   → Telegram Bot API
        │
        │  ProviderAdapterRegistry.get('sendgrid')       [futur]
        └── SendgridProviderAdapter   → SendGrid Email API
```

**Ajouter un provider = écrire un adaptateur + l'enregistrer.** Le moteur FlowBot, les flows, les sessions, les analytics : rien ne change.

---

## 2. Vue d'ensemble de l'architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MODULE FLOWBOT (core)                          │
│                                                                       │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │  FlowEngine  │   │ FlowSession  │   │  FlowAnalytics Service   │ │
│  │  Service     │   │ Service      │   └──────────────────────────┘ │
│  └──────┬───────┘   └──────┬───────┘                                │
│         │                  │                                          │
│  ┌──────▼──────────────────▼────────────────────────────────────┐   │
│  │                    Entités propres                             │   │
│  │  bot_conversation   bot_message     │   │
│  │  flow_bot      flow_trigger       flow_node     flow_edge     │   │
│  │  flow_session  flow_session_log   flow_analytics              │   │
│  └────────────────────────────────────────────────────────────--─┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  interface ProviderAdapter          ← définie DANS flowbot     │  │
│  │  class ProviderAdapterRegistry      ← indexé par provider      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ implements ProviderAdapter
         ┌─────────────────────┼──────────────────────┐
         │                     │                       │
┌────────▼────────┐  ┌─────────▼────────┐  ┌──────────▼──────────┐
│ WhapiProvider   │  │  MetaProvider    │  │ TelegramProvider    │
│ Adapter         │  │  Adapter         │  │ Adapter  [futur]    │
│ provider='whapi'│  │  provider='meta' │  │ provider='telegram' │
│ (whapi module)  │  │  (meta module)   │  │ (telegram module)   │
└────────┬────────┘  └─────────┬────────┘  └─────────────────────┘
         │                     │
         ▼                     ▼
WhapiService           MetaGraphApi
DispatcherService      DispatcherService
Gateway                Gateway
```

### Flux de données — provider Whapi
```
Webhook Whapi entrant
  → WhapiInboundService
  → émet 'bot.inbound' { provider: 'whapi', channelType: 'whatsapp', ... }
  → BotInboundListener (FlowBot)
  → FlowEngine.handleInbound()
  → ProviderAdapterRegistry.get('whapi')     ← routing par provider
  → WhapiProviderAdapter.sendMessage()
  → WhapiService.send()
```

### Flux de données — provider Meta (identique côté FlowBot)
```
Webhook Meta entrant
  → MetaInboundService
  → émet 'bot.inbound' { provider: 'meta', channelType: 'whatsapp', ... }
  → BotInboundListener (FlowBot)              ← même listener
  → FlowEngine.handleInbound()                ← même moteur
  → ProviderAdapterRegistry.get('meta')       ← routing par provider
  → MetaProviderAdapter.sendMessage()
  → MetaGraphApiService.send()
```

**Le moteur FlowBot exécute le même code pour tous les providers.** Seul l'adaptateur final change.

---

## 3. Entités propres au FlowBot

### Principe : le FlowBot ne stocke que ce qu'il possède vraiment

> `whatsapp_chat` détient déjà le contexte complet : contact, channel, provider, agent assigné, timestamps d'activité.  
> `whatsapp_message` détient déjà tous les messages échangés.  
> Le FlowBot n'a **pas** à dupliquer ces informations — elles lui parviennent via l'événement déclencheur.

Le FlowBot stocke **uniquement** :
1. **Son état de conversation** — `bot_conversation` : référence souple + quel flow tourne + flags propres au bot
2. **Ses propres messages envoyés** — `bot_message` : les messages que le bot a rédigés et envoyés, avec leur contexte de flow (node, session)
3. **Sa configuration** — `flow_bot`, `flow_node`, `flow_edge`, `flow_trigger`, `flow_condition`, `flow_action`
4. **L'état d'exécution** — `flow_session`, `flow_session_log`

Pour le polling (« pas de réponse depuis 30 min ») : le job interroge `flow_session WHERE status='waiting_reply' AND last_activity_at < NOW() - INTERVAL` — entièrement dans ses propres tables, sans toucher à `whatsapp_chat`.

---

### 3.1 `bot_conversation` — État FlowBot pur, sans duplication de contexte

`bot_conversation` ne stocke **pas** le contexte de la conversation (contact, channel, provider, agent) — ces données sont déjà dans `whatsapp_chat` et arrivent via l'événement déclencheur.

Elle stocke uniquement **l'état que le FlowBot possède en propre** :

```sql
CREATE TABLE bot_conversation (
  id                VARCHAR(36) PRIMARY KEY,

  -- Référence souple vers la conversation source — PAS de FK TypeORM
  -- Whapi/Meta : whatsapp_chat.chat_id  (ex: "33612345678@s.whatsapp.net")
  -- Telegram   : chat_id numérique sous forme string
  chat_ref          VARCHAR(255) NOT NULL UNIQUE,

  -- État du FlowBot pour cette conversation
  status            ENUM('idle','bot_active','waiting','escalated','completed') DEFAULT 'idle',

  -- Session FlowBot active (null si aucun flow en cours)
  active_session_id VARCHAR(36),

  -- Flags propres au FlowBot — utilisés dans les conditions de branchement
  -- (ne pas chercher à les synchroniser avec whatsapp_chat)
  is_known_contact  BOOLEAN DEFAULT FALSE,  -- le bot a déjà vu ce contact
  is_reopened       BOOLEAN DEFAULT FALSE,  -- conversation rouverte après clôture bot

  created_at        DATETIME NOT NULL,
  updated_at        DATETIME,

  INDEX idx_session (active_session_id),
  INDEX idx_status (status)
);
```

> **Cycle de vie :**  
> La ligne `bot_conversation` est créée à la première activation du FlowBot sur une conversation.  
> Elle persiste entre les sessions — c'est la mémoire d'état long-terme du bot pour ce contact.  
> Le contexte de routing (provider, channel) est résolu à chaque exécution via l'événement entrant.

---

### 3.2 `bot_message` — Uniquement les messages que le bot a envoyés

`bot_message` ne stocke **pas** les messages clients ni les messages agent — ceux-ci sont dans `whatsapp_message`.  
Il stocke uniquement les messages que **le bot a lui-même rédigés et envoyés**, avec leur contexte de flow.

> **Pourquoi ne pas simplement lire `whatsapp_message` ?**  
> `whatsapp_message` ne connaît pas le contexte d'exécution du flow : quel nœud a déclenché le message, quelle session était active. Ces champs sont exclusifs au FlowBot.

```sql
CREATE TABLE bot_message (
  id               VARCHAR(36) PRIMARY KEY,

  -- Session qui a produit ce message (toujours une session FlowBot active)
  session_id       VARCHAR(36) NOT NULL REFERENCES flow_session(id) ON DELETE CASCADE,

  -- Nœud de flow qui a déclenché l'envoi
  flow_node_id     VARCHAR(36),

  -- Contenu réel envoyé par le bot
  content_type     ENUM('text','image','audio','video','document','template') DEFAULT 'text',
  content          TEXT,
  media_url        VARCHAR(500),

  -- Référence souple vers le message dans le provider (Whapi msg_id, Meta message_id…)
  -- Permet de corréler avec whatsapp_message si besoin, sans FK
  external_msg_ref VARCHAR(255),

  sent_at          DATETIME NOT NULL,

  INDEX idx_session (session_id),
  INDEX idx_node (flow_node_id)
);
```

> **Analyse sémantique (parsed_intent) :**  
> L'intent extrait de la réponse client n'est **pas** stocké dans `bot_message` — c'est une variable de session.  
> Il est écrit dans `flow_session.variables` (JSON) par le nœud `intent_parser` et lu par les conditions de branchement suivantes.



## 4. Interface ProviderAdapter

Définie **dans le module FlowBot**, implémentée dans **chaque module provider**.

### 4.1 Les types de contexte (provider-agnostiques)

```typescript
// flowbot/interfaces/provider-adapter.interface.ts

/** Contexte minimal que le FlowBot passe à l'adaptateur pour identifier la conversation */
export interface BotConversationContext {
  externalRef: string;           // chat_id WA, thread_id email, user_id Telegram
  provider: string;              // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'
  channelType: string;           // 'whatsapp' | 'telegram' | 'email'
  providerChannelRef?: string;   // ID du canal provider (Whapi channel, Meta WABA ID)
}

/** Message sortant — format universel traduit par l'adaptateur en format provider */
export interface BotOutboundMessage {
  context: BotConversationContext;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  // Champs optionnels — ignorés si le provider ne les supporte pas
  replyToExternalRef?: string;   // Réponse à un message précis (WA, TG)
  templateName?: string;         // Template HSM pour Meta hors fenêtre 24h
  templateParams?: string[];
}

/** Résultat d'un envoi */
export interface BotSendResult {
  externalMessageRef: string;    // ID du message créé côté provider
  sentAt: Date;
}
```

### 4.2 L'interface ProviderAdapter

```typescript
export interface ProviderAdapter {
  /** Clé unique du provider — utilisée comme index dans le registry */
  readonly provider: string;     // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'

  /** Canal que ce provider sert */
  readonly channelType: string;  // 'whatsapp' | 'telegram' | 'email' | 'sms'

  // ─── Messagerie ───────────────────────────────────────────────────────────

  /** Envoie un message (texte ou média) */
  sendMessage(msg: BotOutboundMessage): Promise<BotSendResult>;

  /** Démarre l'indicateur "en train d'écrire" — no-op si non supporté */
  sendTyping(ctx: BotConversationContext): Promise<void>;

  /** Arrête l'indicateur — no-op si non supporté */
  stopTyping(ctx: BotConversationContext): Promise<void>;

  /** Marque la conversation comme lue côté provider — no-op si non supporté */
  markAsRead(ctx: BotConversationContext): Promise<void>;

  // ─── Actions système ──────────────────────────────────────────────────────

  /**
   * Assigne la conversation à un agent humain.
   * agentRef = null → file d'attente globale.
   * Chaque adaptateur traduit ça selon sa logique interne.
   */
  assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void>;

  /** Ferme la conversation côté système */
  closeConversation(ctx: BotConversationContext): Promise<void>;

  /** Notifie le frontend temps réel (Socket.io, SSE, webhook…) */
  emitConversationUpdated(ctx: BotConversationContext): Promise<void>;

  // ─── Capacités déclarées ─────────────────────────────────────────────────

  /**
   * Déclare ce que ce provider supporte.
   * Le FlowEngine adapte son comportement selon les capacités.
   */
  capabilities(): ProviderCapabilities;
}

export interface ProviderCapabilities {
  typing: boolean;               // Supporte les indicateurs de frappe
  markAsRead: boolean;           // Supporte la lecture des messages
  media: boolean;                // Peut envoyer images/vidéos/docs
  templates: boolean;            // Supporte les templates (HSM Meta, etc.)
  replyTo: boolean;              // Peut répondre à un message précis
  windowHours: number | null;    // Fenêtre de messagerie (24h Meta, null = illimité)
}
```

### 4.3 ProviderAdapterRegistry

```typescript
// flowbot/services/provider-adapter-registry.service.ts

@Injectable()
export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly logger = new Logger(ProviderAdapterRegistry.name);

  /** Appelé par chaque module provider dans son onModuleInit() */
  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
    this.logger.log(`ProviderAdapter registered: provider="${adapter.provider}" channelType="${adapter.channelType}"`);
  }

  /** Retourne l'adaptateur pour un provider donné */
  get(provider: string): ProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Aucun ProviderAdapter enregistré pour provider="${provider}". Providers disponibles: [${[...this.adapters.keys()].join(', ')}]`);
    }
    return adapter;
  }

  /** Retourne null au lieu de throw — pour les contextes dégradés */
  getSafe(provider: string): ProviderAdapter | null {
    return this.adapters.get(provider) ?? null;
  }

  /** Liste tous les providers enregistrés */
  listProviders(): string[] {
    return [...this.adapters.keys()];
  }

  /** Retourne tous les adaptateurs pour un channelType donné */
  getByChannelType(channelType: string): ProviderAdapter[] {
    return [...this.adapters.values()].filter(a => a.channelType === channelType);
  }
}
```

### 4.4 Implémentations — un adaptateur par provider

#### WhapiProviderAdapter (dans `whapi/` — pas dans `flowbot/`)

```typescript
// whapi/adapters/whapi-provider.adapter.ts

@Injectable()
export class WhapiProviderAdapter implements ProviderAdapter {
  readonly provider = 'whapi';
  readonly channelType = 'whatsapp';

  constructor(
    private readonly whapiService: WhapiService,
    private readonly dispatcher: DispatcherService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  capabilities(): ProviderCapabilities {
    return {
      typing: true,
      markAsRead: true,
      media: true,
      templates: false,          // Whapi ne gère pas les templates HSM
      replyTo: true,
      windowHours: null,         // Pas de fenêtre 24h sur Whapi
    };
  }

  async sendMessage(msg: BotOutboundMessage): Promise<BotSendResult> {
    const result = await this.whapiService.sendMessage({
      to: msg.context.externalRef,
      text: msg.text,
      channelId: msg.context.providerChannelRef,
      // ... traduction format Whapi
    });
    return { externalMessageRef: result.id, sentAt: new Date() };
  }

  async sendTyping(ctx: BotConversationContext): Promise<void> {
    await this.whapiService.sendTyping(ctx.externalRef, ctx.providerChannelRef);
  }

  async assignToAgent(ctx: BotConversationContext, agentRef?: string): Promise<void> {
    await this.dispatcher.assignConversation(ctx.externalRef, agentRef ?? null);
  }

  // etc.
}
```

#### MetaProviderAdapter (dans `meta/` — pas dans `flowbot/`)

```typescript
// meta/adapters/meta-provider.adapter.ts

@Injectable()
export class MetaProviderAdapter implements ProviderAdapter {
  readonly provider = 'meta';
  readonly channelType = 'whatsapp';

  capabilities(): ProviderCapabilities {
    return {
      typing: false,             // Meta WABA ne supporte pas les indicateurs
      markAsRead: true,
      media: true,
      templates: true,           // HSM obligatoire hors fenêtre 24h
      replyTo: true,
      windowHours: 24,           // ⚠️ Fenêtre 24h — le FlowEngine en tient compte
    };
  }

  async sendMessage(msg: BotOutboundMessage): Promise<BotSendResult> {
    // Si hors fenêtre 24h ET template défini → envoyer template HSM
    // Sinon → message texte normal
    const result = await this.metaGraphApi.sendMessage({ ... });
    return { externalMessageRef: result.messages[0].id, sentAt: new Date() };
  }

  // etc.
}
```

### 4.5 Enregistrement au démarrage

```typescript
// whapi.module.ts
@Module({ ... })
export class WhapiModule implements OnModuleInit {
  constructor(
    private readonly whapiAdapter: WhapiProviderAdapter,
    private readonly adapterRegistry: ProviderAdapterRegistry,
  ) {}

  onModuleInit(): void {
    this.adapterRegistry.register(this.whapiAdapter);
  }
}

// meta.module.ts — même pattern
onModuleInit(): void {
  this.adapterRegistry.register(this.metaAdapter);
}

// À l'avenir — telegram.module.ts
onModuleInit(): void {
  this.adapterRegistry.register(this.telegramAdapter);
}
```

### 4.6 Utilisation dans le FlowEngine — gestion des capacités

```typescript
// flowbot/services/flow-engine.service.ts

private async sendNodeMessage(session: FlowSession, node: FlowNode, execCtx: BotExecutionContext): Promise<void> {
  // execCtx est passé par l'appelant — construit depuis l'événement entrant
  // ou résolu depuis whatsapp_chat par le job de polling (point d'intégration explicite)
  const adapter = this.adapterRegistry.get(execCtx.provider);
  const caps = adapter.capabilities();
  const ctx: BotConversationContext = {
    externalRef: execCtx.externalRef,
    provider: execCtx.provider,
    channelType: execCtx.channelType,
    providerChannelRef: execCtx.providerChannelRef,
  };

  // Vérifie fenêtre de messagerie avant d'envoyer
  if (caps.windowHours !== null) {
    const hoursSinceLastInbound = execCtx.lastInboundAt
      ? (Date.now() - execCtx.lastInboundAt.getTime()) / 3_600_000
      : Infinity;
    if (hoursSinceLastInbound > caps.windowHours) {
      // Provider avec fenêtre (ex: Meta) — hors fenêtre → utiliser template si disponible
      if (caps.templates && node.config.templateName) {
        return adapter.sendMessage({ context: ctx, templateName: node.config.templateName, templateParams: node.config.templateParams });
      }
      // Pas de template → skip avec log (ne pas envoyer hors fenêtre)
      this.logger.warn(`Node ${node.id} skipped — hors fenêtre ${caps.windowHours}h pour provider "${conv.provider}"`);
      return;
    }
  }

  // Typing si supporté
  if (caps.typing && node.config.typingDelaySeconds > 0) {
    await adapter.sendTyping(ctx);
    await sleep(node.config.typingDelaySeconds * 1000);
    await adapter.stopTyping(ctx);
  }

  await adapter.sendMessage({ context: ctx, text: resolvedText });
}
```

---

## 5. Communication événementielle

Le FlowBot ne connaît pas `InboundMessageService`, `WhapiService`, ni aucun service provider.  
Chaque module provider émet des événements standardisés — le FlowBot écoute tous ces événements via le même listener.

### 5.1 Contrat des événements — défini dans FlowBot, respecté par tous les providers

```typescript
// flowbot/events/bot-inbound-message.event.ts

export const BOT_INBOUND_EVENT = 'bot.inbound';

export class BotInboundMessageEvent {
  // ─── Identification provider ─────────────────────────────────────────────
  provider: string;                // 'whapi' | 'meta' | 'telegram_bot' | 'sendgrid'
  channelType: string;             // 'whatsapp' | 'telegram' | 'email' | 'sms'
  providerChannelRef?: string;     // ID du canal provider (Whapi channel ID, Meta WABA)

  // ─── Identification conversation ─────────────────────────────────────────
  conversationExternalRef: string; // Format brut du provider (normalisé par BotConversationService)

  // ─── Contact ─────────────────────────────────────────────────────────────
  contactExternalId: string;       // Identifiant normalisé (sans @s.whatsapp.net, sans +, etc.)
  contactName: string;

  // ─── Message ─────────────────────────────────────────────────────────────
  messageText?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'reaction';
  mediaUrl?: string;
  externalMessageRef: string;      // ID du message côté provider
  receivedAt: Date;

  // ─── Contexte dispatch (calculé par le service émetteur) ─────────────────
  isNewConversation: boolean;      // Premier message de ce contact sur ce provider
  isReopened: boolean;             // Conversation précédemment fermée
  isOutOfHours: boolean;           // Hors horaires d'ouverture
  agentAssignedRef?: string;       // Agent déjà assigné s'il y en a un
}
```

```typescript
// flowbot/events/bot-agent.events.ts

export const BOT_AGENT_CONNECTED_EVENT    = 'bot.agent.connected';
export const BOT_AGENT_DISCONNECTED_EVENT = 'bot.agent.disconnected';
export const BOT_CONVERSATION_ASSIGNED_EVENT = 'bot.conversation.assigned';

export class BotAgentConnectedEvent {
  agentRef: string;      // poste_id
  agentName: string;
  provider?: string;     // Si agent dédié à un provider spécifique
}

export class BotAgentDisconnectedEvent {
  agentRef: string;
}

export class BotConversationAssignedEvent {
  conversationExternalRef: string;
  provider: string;
  agentRef: string;
}
```

```typescript
// flowbot/events/bot-outbound.events.ts

// Émis par FlowBot → écouté par les modules provider pour agir
export const BOT_ESCALATE_EVENT = 'bot.escalate';
export const BOT_CLOSE_EVENT    = 'bot.close';

export class BotEscalateRequestEvent {
  conversationExternalRef: string;
  provider: string;
  agentRef?: string;
  reason: 'timeout' | 'user_request' | 'max_steps' | 'no_flow_match';
}

export class BotCloseRequestEvent {
  conversationExternalRef: string;
  provider: string;
}
```

### 5.2 Émission côté provider — chaque service émet le même contrat

#### WhapiInboundService (émet `bot.inbound` avec `provider='whapi'`)

```typescript
// whapi/whapi-inbound.service.ts

async handleInbound(payload: WhapiWebhookPayload): Promise<void> {
  const chat = await this.dispatcher.assignConversation(...);
  const message = await this.whapiMessageService.save(...);

  this.eventEmitter.emit(BOT_INBOUND_EVENT, {
    provider: 'whapi',
    channelType: 'whatsapp',
    providerChannelRef: payload.channelId,
    conversationExternalRef: chat.chat_id,
    contactExternalId: normalizeWaPhone(chat.chat_id),  // retire @s.whatsapp.net
    contactName: chat.name,
    messageText: message.text,
    messageType: message.type,
    externalMessageRef: message.id,
    receivedAt: new Date(),
    isNewConversation: chat.unread_count === 1,
    isReopened: !!chat.reopened_at,
    isOutOfHours: !(await this.businessHours.isOpen()),
    agentAssignedRef: chat.poste_id ?? undefined,
  } satisfies BotInboundMessageEvent);
}
```

#### MetaInboundService (émet le même événement avec `provider='meta'`)

```typescript
// meta/meta-inbound.service.ts

async handleInbound(payload: MetaWebhookPayload): Promise<void> {
  // ...
  this.eventEmitter.emit(BOT_INBOUND_EVENT, {
    provider: 'meta',                          // ← seule différence
    channelType: 'whatsapp',
    providerChannelRef: payload.wabaId,
    conversationExternalRef: chat.chat_id,
    contactExternalId: normalizeMetaPhone(payload.from),  // retire le +
    // ... reste identique
  } satisfies BotInboundMessageEvent);
}
```

#### TelegramInboundService (futur — même contrat)

```typescript
this.eventEmitter.emit(BOT_INBOUND_EVENT, {
  provider: 'telegram_bot',
  channelType: 'telegram',
  conversationExternalRef: `${update.message.chat.id}`,
  contactExternalId: `${update.message.from.id}`,
  contactName: update.message.from.first_name,
  // ...
} satisfies BotInboundMessageEvent);
```

### 5.3 Réception côté FlowBot — un seul listener pour tous les providers

```typescript
// flowbot/listeners/bot-inbound.listener.ts

@Injectable()
export class BotInboundListener {
  constructor(private readonly flowEngine: FlowEngineService) {}

  @OnEvent(BOT_INBOUND_EVENT)   // écoute TOUS les providers
  async handle(event: BotInboundMessageEvent): Promise<void> {
    // Le FlowEngine reçoit le même event quelle que soit la source
    await this.flowEngine.handleInbound(event);
  }
}
```

Le FlowEngine routing se fait via `event.provider` → `ProviderAdapterRegistry.get(event.provider)`.

---

## 6. Concepts métier

### 6.1 Flow
Un scénario conversationnel complet avec un ou plusieurs déclencheurs, un nœud de départ, des nœuds enchaînés, et des conditions de sortie.

### 6.2 Types de nœuds

| Type | Description |
|------|-------------|
| `MESSAGE` | Envoie un message (texte, image, doc) via `ChannelAdapter` |
| `QUESTION` | Envoie un message ET attend la réponse client avant de continuer |
| `CONDITION` | Évalue des règles sans envoyer de message — choisit une branche |
| `ACTION` | Exécute une action système via `ChannelAdapter` ou `EventEmitter` |
| `WAIT` | Pause configurable (délai fixe ou aléatoire) |
| `ESCALATE` | Transfert à un agent humain — sort du flow |
| `END` | Fin du flow proprement |
| `AB_TEST` | Sépare le trafic en branches pondérées |

### 6.3 Types de conditions

| Type | Source de la valeur |
|------|---------------------|
| `message_contains` | `flow_session.variables['last_message_text']` — texte du dernier message client stocké en variable de session |
| `message_equals` | `flow_session.variables['last_message_text']` |
| `message_matches_regex` | `flow_session.variables['last_message_text']` |
| `parsed_intent_equals` | `flow_session.variables['parsed_intent']` — écrit par le nœud `intent_parser` |
| `contact_is_new` | `bot_conversation.is_known_contact = false` |
| `business_hours` | `BusinessHoursService` (dans flowbot) |
| `channel_type` | `BotExecutionContext.channelType` — issu de l'événement entrant |
| `wait_minutes` | `NOW() - flow_session.last_activity_at` |
| `variable_equals` | `flow_session.variables[key]` |
| `agent_assigned` | `BotExecutionContext.assignedAgentRef IS NOT NULL` — issu de l'événement entrant |
| `always` | Branche par défaut |

### 6.4 Types d'actions

| Type | Ce qui est appelé |
|------|-------------------|
| `send_typing` | `ChannelAdapter.sendTyping()` |
| `assign_agent` | `ChannelAdapter.assignToAgent()` |
| `close_conversation` | `ChannelAdapter.closeConversation()` |
| `mark_as_read` | `ChannelAdapter.markAsRead()` |
| `set_tag` | Mise à jour `flow_session.variables['tags']` + événement custom |
| `set_variable` | Mise à jour `flow_session.variables` |
| `set_contact_known` | Mise à jour `bot_conversation.is_known_contact` |
| `send_webhook` | HTTP call externe (URL configurable) |
| `emit_event` | Événement NestJS custom pour extensibilité |

### 6.5 Session
Objet qui représente l'état d'une `bot_conversation` dans un flow donné. Une conversation n'a qu'une session active à la fois. La session stocke :
- Le nœud courant
- Les variables collectées (JSON libre)
- Le statut : `active` | `waiting_reply` | `waiting_delay` | `completed` | `escalated` | `expired`

---

## 7. Schéma de base de données

> ⚠️ Toutes ces tables appartiennent au module FlowBot. Aucune FK vers `whatsapp_chat`, `whatsapp_message`, `whatsapp_poste` ou `whatsapp_commercial`.

### 7.1 Tables de configuration des flows

```sql
-- Le flow lui-même
CREATE TABLE flow_bot (
  id           VARCHAR(36) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN DEFAULT FALSE,
  priority     INT DEFAULT 0,
  -- Scope : à quel contexte ce flow s'applique
  scope_channel_type  VARCHAR(50),      -- null = tous les canaux
  scope_provider_ref  VARCHAR(36),      -- null = tous les providers
  created_at   DATETIME,
  updated_at   DATETIME
);

-- Les déclencheurs d'entrée d'un flow
CREATE TABLE flow_trigger (
  id                 VARCHAR(36) PRIMARY KEY,
  flow_id            VARCHAR(36) NOT NULL REFERENCES flow_bot(id) ON DELETE CASCADE,
  trigger_type       ENUM(
    'INBOUND_MESSAGE',
    'CONVERSATION_OPEN',
    'CONVERSATION_REOPEN',
    'OUT_OF_HOURS',
    'ON_ASSIGN',
    'QUEUE_WAIT',
    'NO_RESPONSE',
    'INACTIVITY',
    'KEYWORD',
    'SCHEDULE'
  ) NOT NULL,
  config             JSON DEFAULT '{}', -- seuils, mots-clés, cron expr, etc.
  is_active          BOOLEAN DEFAULT TRUE
);

-- Les nœuds du flow
CREATE TABLE flow_node (
  id             VARCHAR(36) PRIMARY KEY,
  flow_id        VARCHAR(36) NOT NULL REFERENCES flow_bot(id) ON DELETE CASCADE,
  type           ENUM('MESSAGE','QUESTION','CONDITION','ACTION','WAIT','ESCALATE','END','AB_TEST') NOT NULL,
  label          VARCHAR(255),
  position_x     FLOAT,                -- coordonnées dans le builder visuel
  position_y     FLOAT,
  config         JSON NOT NULL DEFAULT '{}',
  timeout_seconds INT,                 -- pour QUESTION uniquement
  is_entry_point BOOLEAN DEFAULT FALSE
);

-- Les connexions entre nœuds
CREATE TABLE flow_edge (
  id               VARCHAR(36) PRIMARY KEY,
  flow_id          VARCHAR(36) NOT NULL REFERENCES flow_bot(id) ON DELETE CASCADE,
  source_node_id   VARCHAR(36) NOT NULL REFERENCES flow_node(id) ON DELETE CASCADE,
  target_node_id   VARCHAR(36) NOT NULL REFERENCES flow_node(id) ON DELETE CASCADE,
  condition_type   VARCHAR(50) DEFAULT 'always',
  condition_value  VARCHAR(500),
  condition_negate BOOLEAN DEFAULT FALSE,
  sort_order       INT DEFAULT 0
);
```

### 7.2 Tables d'exécution (runtime)

```sql
-- bot_contact supprimé — données dénormalisées dans bot_conversation (voir §3.1)
-- SUPPRIME: CREATE TABLE bot_contact (
--   id            VARCHAR(36) PRIMARY KEY,
--   external_id   VARCHAR(255) NOT NULL,
--   channel_type  VARCHAR(50) NOT NULL,
--   name          VARCHAR(255),
--   is_known      BOOLEAN DEFAULT FALSE,
--   tags          JSON DEFAULT '[]',
--   metadata      JSON DEFAULT '{}',
--   first_seen_at DATETIME NOT NULL,
--   last_seen_at  DATETIME,
--   UNIQUE KEY uk_ext_chan (external_id, channel_type)
-- );

-- État FlowBot d'une conversation — référence souple vers le système source
CREATE TABLE bot_conversation (
  id                VARCHAR(36) PRIMARY KEY,
  chat_ref          VARCHAR(255) NOT NULL UNIQUE, -- ref souple vers whatsapp_chat.chat_id
  status            ENUM('idle','bot_active','waiting','escalated','completed') DEFAULT 'idle',
  active_session_id VARCHAR(36),
  is_known_contact  BOOLEAN DEFAULT FALSE,        -- le bot a déjà vu ce contact
  is_reopened       BOOLEAN DEFAULT FALSE,        -- conversation rouverte après clôture bot
  created_at        DATETIME NOT NULL,
  updated_at        DATETIME,
  INDEX idx_session (active_session_id),
  INDEX idx_status (status)
);

-- Messages envoyés par le bot (uniquement outbound bot) avec contexte de flow
CREATE TABLE bot_message (
  id               VARCHAR(36) PRIMARY KEY,
  session_id       VARCHAR(36) NOT NULL REFERENCES flow_session(id) ON DELETE CASCADE,
  flow_node_id     VARCHAR(36),
  content_type     ENUM('text','image','audio','video','document','template') DEFAULT 'text',
  content          TEXT,
  media_url        VARCHAR(500),
  external_msg_ref VARCHAR(255),  -- ref souple vers l'ID message dans le provider
  sent_at          DATETIME NOT NULL,
  INDEX idx_session (session_id),
  INDEX idx_node (flow_node_id)
);

-- bot_agent supprimé — assigned_agent_ref dans bot_conversation est une référence souple (voir §3.1)
-- SUPPRIME: CREATE TABLE bot_agent (
--   id            VARCHAR(36) PRIMARY KEY,
--   external_ref  VARCHAR(36) NOT NULL UNIQUE,
--   name          VARCHAR(255) NOT NULL,
--   is_available  BOOLEAN DEFAULT FALSE,
--   channel_type  VARCHAR(50) DEFAULT 'all',
--   updated_at    DATETIME
-- );

-- État courant d'une conversation dans un flow
CREATE TABLE flow_session (
  id               VARCHAR(36) PRIMARY KEY,
  conversation_id  VARCHAR(36) NOT NULL REFERENCES bot_conversation(id),
  flow_id          VARCHAR(36) NOT NULL REFERENCES flow_bot(id),
  current_node_id  VARCHAR(36) REFERENCES flow_node(id),
  status           ENUM('active','waiting_reply','waiting_delay','completed','escalated','expired','cancelled') DEFAULT 'active',
  variables        JSON DEFAULT '{}',
  steps_count      INT DEFAULT 0,
  trigger_type     VARCHAR(50),
  started_at       DATETIME NOT NULL,
  last_activity_at DATETIME,
  completed_at     DATETIME,
  escalated_at     DATETIME,
  INDEX idx_conversation_status (conversation_id, status)
);

-- Log pas-à-pas de l'exécution (debug + analytics)
CREATE TABLE flow_session_log (
  id             VARCHAR(36) PRIMARY KEY,
  session_id     VARCHAR(36) NOT NULL REFERENCES flow_session(id) ON DELETE CASCADE,
  node_id        VARCHAR(36),
  node_type      VARCHAR(50),
  edge_taken_id  VARCHAR(36),
  action         VARCHAR(100),
  result         VARCHAR(500),
  metadata       JSON,
  executed_at    DATETIME NOT NULL,
  INDEX idx_session (session_id)
);
```

### 7.3 Tables analytics

```sql
CREATE TABLE flow_analytics (
  id                   VARCHAR(36) PRIMARY KEY,
  flow_id              VARCHAR(36) NOT NULL REFERENCES flow_bot(id),
  period_date          DATE NOT NULL,
  sessions_started     INT DEFAULT 0,
  sessions_completed   INT DEFAULT 0,
  sessions_escalated   INT DEFAULT 0,
  sessions_expired     INT DEFAULT 0,
  avg_steps            FLOAT,
  avg_duration_seconds FLOAT,
  UNIQUE KEY uk_flow_date (flow_id, period_date)
);

CREATE TABLE flow_node_analytics (
  id               VARCHAR(36) PRIMARY KEY,
  node_id          VARCHAR(36) NOT NULL REFERENCES flow_node(id),
  period_date      DATE NOT NULL,
  visits           INT DEFAULT 0,
  exits_completed  INT DEFAULT 0,
  exits_escalated  INT DEFAULT 0,
  exits_expired    INT DEFAULT 0,
  avg_wait_seconds FLOAT,
  UNIQUE KEY uk_node_date (node_id, period_date)
);
```

---

## 8. Structure du module NestJS

```
src/
└── flowbot/
    ├── flowbot.module.ts
    │     imports: [TypeOrmModule(entités flowbot uniquement), EventEmitterModule, JorBsModule]
    │     providers: [tous les services ci-dessous]
    │     exports: [ChannelAdapterRegistry, FlowEngineService]
    │
    ├── interfaces/
    │   └── channel-adapter.interface.ts      ← DÉFINI ICI, implémenté ailleurs
    │
    ├── entities/
    │   ├── bot-conversation.entity.ts
    │   ├── bot-message.entity.ts
    │   ├── flow-bot.entity.ts
    │   ├── flow-trigger.entity.ts
    │   ├── flow-node.entity.ts
    │   ├── flow-edge.entity.ts
    │   ├── flow-session.entity.ts
    │   ├── flow-session-log.entity.ts
    │   └── flow-analytics.entity.ts
    │
    ├── events/
    │   ├── bot-inbound-message.event.ts
    │   ├── bot-agent-connected.event.ts
    │   ├── bot-agent-disconnected.event.ts
    │   ├── bot-conversation-assigned.event.ts
    │   ├── bot-escalate-request.event.ts     ← écouté par DispatcherService
    │   └── bot-close-request.event.ts        ← écouté par WhatsappChatService
    │
    ├── services/
    │   ├── channel-adapter-registry.service.ts
    │   ├── bot-conversation.service.ts       ← upsert bot_conversation (contact dénormalisé)
    │   ├── bot-message.service.ts            ← Sauvegarde des messages FlowBot
    │   ├── flow-crud.service.ts              ← CRUD flows, nœuds, arêtes
    │   ├── flow-engine.service.ts            ← Moteur d'exécution (§9)
    │   ├── flow-session.service.ts           ← Gestion des sessions
    │   ├── flow-trigger.service.ts           ← Évaluation des triggers
    │   ├── flow-condition.service.ts         ← Évaluation des conditions
    │   ├── flow-action.service.ts            ← Exécution des actions via adapter
    │   ├── flow-variable.service.ts          ← Résolution {client_name} etc.
    │   ├── flow-analytics.service.ts         ← Agrégation des statistiques
    │   └── business-hours.service.ts         ← Copie ou import partagé
    │
    ├── jobs/
    │   ├── flow-polling.job.ts               ← Triggers temporels (NO_RESPONSE, etc.)
    │   └── flow-session-cleaner.job.ts       ← Expire les sessions bloquées
    │
    ├── listeners/
    │   ├── bot-inbound.listener.ts           ← @OnEvent('bot.inbound') → FlowEngine
    │   ├── bot-agent-connected.listener.ts   ← @OnEvent('bot.agent.connected')
    │   └── bot-conversation-assigned.listener.ts
    │
    └── flowbot.controller.ts                 ← API admin (CRUD + analytics)
```

### Imports autorisés dans `flowbot.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BotConversation, BotMessage,
      FlowBot, FlowTrigger, FlowNode, FlowEdge,
      FlowSession, FlowSessionLog, FlowAnalytics, FlowNodeAnalytics,
    ]),
    // ✅ OK
    EventEmitterModule,
    JorBsModule,                // pour CronConfigService (polling jobs)
    BusinessHoursModule,        // partagé — pas de dépendance WA directe

    // ❌ INTERDIT
    // WhatsappChatModule
    // WhatsappMessageModule
    // DispatcherModule
  ],
})
export class FlowBotModule {}
```

---

## 9. Moteur d'exécution

### 9.1 FlowEngineService — Interface publique

```typescript
@Injectable()
export class FlowEngineService {

  // Appelé par BotInboundListener (via événement)
  async handleInbound(event: BotInboundMessageEvent): Promise<void>

  // Appelé par FlowPollingJob
  async handlePollingTrigger(conv: BotConversation, triggerType: string): Promise<void>

  // Reprend une session en attente (après délai WAIT ou timeout QUESTION)
  async resumeSession(sessionId: string, triggerReason: string): Promise<void>
}
```

### 9.2 Cycle d'exécution d'un message entrant

```
handleInbound(event)
    │
    ├─ BotConversationService.upsert(event)       → upsert bot_conversation (contact dénormalisé inclus)
    ├─ BotMessageService.saveInbound(event)        → sauvegarde dans bot_message
    │
    ├─ FlowSessionService.getActiveSession(conv)
    │    ├─ Session waiting_reply → reprendre le flow (réponse client arrivée)
    │    └─ Pas de session active → chercher un trigger
    │
    ├─ FlowTriggerService.findMatchingFlow(conv, event)
    │    └─ Retourne le flow le plus prioritaire dont un trigger matche
    │
    ├─ FlowSessionService.createSession(conv, flow, triggerType)
    │
    └─ executeNode(session, entryNode)
```

### 9.3 Exécution d'un nœud

```
executeNode(session, node):

  MESSAGE:
    1. FlowVariableService.resolve(node.config.body, session) → texte final
    2. Choisir variante A/B si applicable (weighted random)
    3. adapter.sendTyping()
    4. Attendre typing_delay_seconds
    5. adapter.sendMessage({ text: resolvedText, ... })
    6. BotMessageService.saveOutbound(...)
    7. Log → flow_session_log
    8. Suivre arête "always" → executeNode(session, nextNode)

  QUESTION:
    1-6. Identique à MESSAGE
    7. session.status = 'waiting_reply' — STOP
       (Reprise déclenchée par le prochain message client)

  CONDITION:
    1. FlowConditionService.evaluate(session, conv, lastMessage)
    2. Trouver première arête dont la condition est vraie (sort_order ASC)
    3. Log résultat
    4. executeNode(session, matchedEdge.targetNode)

  ACTION:
    1. FlowActionService.execute(session, action, adapter)
    2. Suivre arête "always" → executeNode(session, nextNode)

  WAIT:
    1. Calculer délai
    2. session.status = 'waiting_delay'
    3. Enregistrer wakeup via CronConfigService ou setTimeout
    4. STOP (reprise via FlowPollingJob ou setTimeout)

  ESCALATE:
    1. adapter.assignToAgent(conv.external_ref, node.config.agentRef)
    2. session.status = 'escalated'
    3. bot_conversation.status = 'escalated'
    4. Émettre 'bot.escalate' pour que DispatcherService réagisse
    5. FIN

  END:
    1. session.status = 'completed'
    2. FlowAnalyticsService.recordCompletion(session)
    3. FIN
```

### 9.4 Résolution des variables

Le `FlowVariableService` résout les variables depuis le `BotExecutionContext` (passé à l'exécution) et les tables FlowBot :

| Variable | Source |
|----------|--------|
| `{contact_name}` | `BotExecutionContext.contactName` — issu de l'événement entrant |
| `{contact_phone}` | `BotExecutionContext.contactRef` — issu de l'événement entrant |
| `{agent_name}` | `BotExecutionContext.agentName` — issu de l'événement entrant |
| `{wait_minutes}` | `NOW() - flow_session.last_activity_at` |
| `{session.VAR}` | `flow_session.variables['VAR']` |
| `{current_time}` | Heure locale formatée |
| `{current_date}` | Date locale formatée |

### 9.5 Protections et anti-boucle

- `session.steps_count` incrémenté à chaque nœud — limite configurable (défaut 50)
- Si même `node_id` apparaît 3× dans le log → escalade automatique
- Timeout global session (défaut 24h) → `FlowSessionCleanerJob` → status = `expired`
- Chaque nœud non-terminal doit avoir une arête `always` → validé à la sauvegarde du flow

---

## 10. Panel admin — Frontend

### Pages

```
admin/src/app/flowbot/
    ├── page.tsx                      ← Liste des flows avec métriques
    ├── [id]/
    │   ├── page.tsx                  ← Builder visuel canvas
    │   ├── settings/page.tsx         ← Triggers, scope, priorité
    │   └── analytics/page.tsx        ← Dashboard du flow
    └── analytics/page.tsx            ← Dashboard global
```

### Builder visuel

Bibliothèque : **React Flow** (`@xyflow/react`) — MIT, pas de dépendance serveur.

**Palette de nœuds (barre latérale) :**
- 🟢 Message — envoie un texte
- 🟢 Question — attend une réponse
- 🔵 Condition — branchement logique
- 🟠 Action — commande système
- ⏱️ Attente — délai
- 🔴 Escalade — vers agent humain
- ⬛ Fin — clôture du flow
- 🟣 Test A/B — split de trafic

**Panneau de config (clic sur un nœud) :**
- Champ texte avec auto-complétion des variables `{...}`
- Sélecteur de type de condition + valeur comparée
- Sélecteur d'action + paramètres (poste, tag, URL webhook)
- Champ timeout pour les nœuds QUESTION

**Sauvegarde :** `PUT /flowbot/:id/graph` → upsert atomique de tous les nœuds + arêtes en une transaction.

---

## 11. Remplacement complet — Mapping A–I + séquence

> À la fin de Phase 5 : `auto-message-master.job.ts` et `auto-message-orchestrator.service.ts` sont supprimés.

### Trigger A — Sans réponse

**Flow :**
```
[TRIGGER: NO_RESPONSE, seuil=60min]
  → [CONDITION: business_hours]
      ├── hors horaires → [MESSAGE: "Nous vous répondrons à notre retour."] → [END]
      └── en horaires   → [MESSAGE: "Un agent vous répond sous peu."]
                              → [WAIT: 60min]
                              → [MESSAGE: "Nous n'avons pas oublié, merci pour votre patience."] → [END]
```
Colonnes supprimées : `no_response_auto_step`, `last_no_response_auto_sent_at`

---

### Trigger C — Hors horaires

**Flow :**
```
[TRIGGER: OUT_OF_HOURS]
  → [MESSAGE: "Nous sommes fermés. Horaires : 9h-18h lun-ven."]
  → [QUESTION: "Votre demande est-elle urgente ? OUI / NON", timeout=3600s]
      ├── contains "oui" → [ACTION: assign_agent] → [MESSAGE: "Un agent vous contacte."] → [END]
      └── on_timeout / "non" → [ACTION: set_tag="rappel"] → [END]
```
Colonne supprimée : `out_of_hours_auto_sent`

---

### Trigger D — Réouverture

**Flow :**
```
[TRIGGER: CONVERSATION_REOPEN]
  → [CONDITION: contact_is_new]
      ├── client connu → [MESSAGE: "Bon retour {contact_name} ! Comment puis-je vous aider ?"] → [END]
      └── nouveau      → [MESSAGE: "Bienvenue ! Un agent va vous prendre en charge."] → [END]
```
Colonne supprimée : `reopened_auto_sent`

---

### Trigger E — Attente en queue

**Flow :**
```
[TRIGGER: QUEUE_WAIT, seuil=30min]
  → [MESSAGE: "Vous êtes en file d'attente. Merci pour votre patience."]
  → [WAIT: 30min]
  → [CONDITION: agent_assigned]
      ├── oui → [END]
      └── non → [MESSAGE: "Nous nous excusons du délai. Un agent arrive bientôt."] → [END]
```
Colonnes supprimées : `queue_wait_auto_step`, `last_queue_wait_auto_sent_at`

---

### Trigger F — Mot-clé

**Flow (un flow par groupe de mots-clés) :**
```
[TRIGGER: KEYWORD, keywords=["prix", "tarif", "devis"]]
  → [MESSAGE: "Pour un devis, voici nos tarifs : ..."] → [END]
```
Colonne supprimée : `keyword_auto_sent_at`  
Table supprimée : `auto_message_keyword` → remplacée par `flow_trigger.config.keywords`

---

### Trigger G — Type de client

**Flow :**
```
[TRIGGER: CONVERSATION_OPEN]
  → [CONDITION: contact_is_new]
      ├── nouveau → [MESSAGE: "Bienvenue chez nous !"] → [ACTION: set_tag="nouveau"] → [END]
      └── connu   → [MESSAGE: "Bon retour {contact_name} !"] → [END]
```
Colonnes supprimées : `client_type_auto_sent`, `is_known_client`

---

### Trigger H — Inactivité

**Flow :**
```
[TRIGGER: INACTIVITY, seuil=120min]
  → [QUESTION: "Êtes-vous toujours là ? Répondez pour continuer.", timeout=1800s]
      ├── réponse reçue → [MESSAGE: "Parfait ! Un agent vous répond."] → [END]
      └── on_timeout    → [ACTION: close_conversation] → [END]
```
Colonnes supprimées : `inactivity_auto_step`, `last_inactivity_auto_sent_at`

---

### Trigger I — Après assignation

**Flow :**
```
[TRIGGER: ON_ASSIGN]
  → [WAIT: 5s]
  → [MESSAGE: "Bonjour {contact_name}, je suis {agent_name} et je vais vous aider."] → [END]
```
Colonne supprimée : `on_assign_auto_sent`

---

### Mode Séquence legacy (AutoMessageOrchestrator)

**Flow :**
```
[TRIGGER: INBOUND_MESSAGE — première occurrence]
  → [WAIT: 300–540s aléatoire]
  → [MESSAGE: template position 1]
  → [QUESTION: attente réponse client, timeout=23h]
      ├── réponse reçue → [MESSAGE: template position 2]
      │                       → [QUESTION: attente, timeout=23h]
      │                           ├── réponse → [MESSAGE: position 3] → [END]
      │                           └── timeout → [END]
      └── on_timeout → [END]
```
Colonnes supprimées : `auto_message_step`, `waiting_client_reply`, `last_auto_message_sent_at`, `auto_message_status`, `auto_message_id`

---

### Tableau des suppressions définitives

**Fichiers supprimés :**
- `jorbs/auto-message-master.job.ts`
- `message-auto/auto-message-orchestrator.service.ts`

**Colonnes supprimées dans `whatsapp_chat` (19 colonnes) :**

| Colonne | Trigger | Phase |
|---------|---------|-------|
| `auto_message_step` | Séquence | 5 |
| `waiting_client_reply` | Séquence | 5 |
| `last_auto_message_sent_at` | Séquence | 5 |
| `auto_message_status` | Séquence | 5 |
| `auto_message_id` | Séquence | 5 |
| `no_response_auto_step` | A | 3 |
| `last_no_response_auto_sent_at` | A | 3 |
| `out_of_hours_auto_sent` | C | 3 |
| `reopened_auto_sent` | D | 3 |
| `queue_wait_auto_step` | E | 3 |
| `last_queue_wait_auto_sent_at` | E | 3 |
| `keyword_auto_sent_at` | F | 3 |
| `client_type_auto_sent` | G | 3 |
| `inactivity_auto_step` | H | 3 |
| `last_inactivity_auto_sent_at` | H | 3 |
| `on_assign_auto_sent` | I | 3 |

**Colonne ajoutée dans `whatsapp_chat` (pont de transition) :**
- `active_flow_session_id VARCHAR(36)` — supprimée en Phase 5 quand la cohabitation prend fin

---

## 12. Phases d'implémentation

### Phase 1 — Fondations & découplage (2–3 semaines)
- [ ] Créer les entités FlowBot (`bot_conversation`, `bot_message`, `flow_*`)
- [ ] Migrations BDD
- [ ] `ChannelAdapterRegistry` + interface `ChannelAdapter`
- [ ] `WhatsappChannelAdapter` dans le module whatsapp (implémente l'interface)
- [ ] `FlowBotModule` sans aucun import `whatsapp_*`
- [ ] Définir tous les événements (`BotInboundMessageEvent`, etc.)
- [ ] `BotInboundListener` : `@OnEvent('bot.inbound')` → FlowEngine
- [ ] Émission de `'bot.inbound'` dans `InboundMessageService`
- [ ] `FlowCrudService` : CRUD flows, nœuds, arêtes
- [ ] `FlowEngineService` : exécution nœuds `MESSAGE`, `WAIT`, `END` uniquement
- [ ] `BotConversationService` : upsert `bot_conversation` (contact dénormalisé inclus)
- [ ] `FlowVariableService`
- [ ] API admin basique : liste des flows, création, activation

**Livrable :** Un flow "Accueil" qui envoie un message à chaque nouveau contact, via l'adaptateur.

---

### Phase 2 — Conditions & questions (2–3 semaines)
- [ ] `FlowConditionService` : tous les types de conditions
- [ ] Nœuds `QUESTION`, `CONDITION`, `ACTION`
- [ ] Attente de réponse client + reprise de session sur `'bot.inbound'`
- [ ] Timeout sur `QUESTION` → branche `on_timeout`
- [ ] `FlowActionService` : toutes les actions via `ChannelAdapter`
- [ ] Triggers `OUT_OF_HOURS`, `ON_ASSIGN`, `KEYWORD`, `CONVERSATION_REOPEN`, `CONVERSATION_OPEN`
- [ ] Listeners : `BotAgentConnectedListener`, `BotConversationAssignedListener`
- [ ] Émission de ces événements depuis `WhatsappMessageGateway` et `DispatcherService`
- [ ] Canvas React Flow (MVP — connexions manuelles)
- [ ] Migration + désactivation triggers C, D, F, G, I dans `auto-message-master`
- [ ] Suppression colonnes BDD correspondantes

**Livrable :** FlowBot gère C, D, F, G, I. Master réduit à A, E, H.

---

### Phase 3 — Polling temporel & escalade (2 semaines)
- [ ] `FlowPollingJob` enregistré dans `CronConfigService`
- [ ] Triggers `NO_RESPONSE`, `QUEUE_WAIT`, `INACTIVITY` — requêtes sur `bot_conversation`
- [ ] Nœud `ESCALATE` complet + événement `'bot.escalate'` écouté par `DispatcherService`
- [ ] `FlowSessionCleanerJob` : expire sessions > 24h
- [ ] Anti-boucle : limite steps_count + détection cycle
- [ ] Migration + désactivation triggers A, E, H dans `auto-message-master`
- [ ] Suppression colonnes BDD correspondantes

**Livrable :** `auto-message-master` ne contient plus aucun trigger actif.

---

### Phase 4 — Séquence legacy & builder complet (2–3 semaines)
- [ ] Migration templates `MessageAuto` BDD → `FlowNode`
- [ ] Flow séquence legacy installé et validé
- [ ] Désactivation + suppression `auto-message-master.job.ts`
- [ ] Désactivation + suppression `auto-message-orchestrator.service.ts`
- [ ] Retrait appel `handleClientMessage()` dans `InboundMessageService`
- [ ] Canvas React Flow complet (drag & drop, palette, panneaux de config)
- [ ] `FlowAnalyticsService` + tables analytics
- [ ] Dashboard admin analytics
- [ ] Nœud `AB_TEST`
- [ ] Bouton "Tester le flow" (simulation)

**Livrable :** Ancien système entièrement remplacé. Builder visuel complet.

---

### Phase 5 — Nettoyage final (1 semaine)
- [ ] Suppression 19 colonnes dans `whatsapp_chat` (migration BDD)
- [ ] Suppression table `auto_message_keyword`
- [ ] Suppression clés `cron_config` : `auto-message`, `auto-message-master` et les 8 config-only
- [ ] Évaluation module `message-auto` : garder ou supprimer selon usage résiduel
- [ ] Suppression colonne pont `active_flow_session_id`
- [ ] Tests d'intégration end-to-end sur tous les triggers via FlowBot
- [ ] Action `send_webhook` (appel API externe depuis un nœud ACTION)
- [ ] Documentation des flows prédéfinis installables

**Livrable FINAL :** Zéro référence à `auto-message-master` dans le codebase. FlowBot est le seul système de messagerie automatique.

---

## 13. Risques et points d'attention

### 13.1 Synchronisation `bot_conversation` / `whatsapp_chat`
Pendant la migration, les deux entités coexistent. La `bot_conversation` est créée/mise à jour à chaque événement `'bot.inbound'`. Il ne faut pas qu'elles divergent. Solution : la `bot_conversation` est une **projection** — elle n'est jamais source de vérité pour le dispatch, seulement pour le FlowBot.

### 13.2 Session orpheline
Une session `waiting_reply` reste bloquée si le webhook n'arrive pas. `FlowSessionCleanerJob` expire les sessions > TTL configuré. Timeout obligatoire sur chaque nœud `QUESTION`.

### 13.3 Adaptateur non enregistré
Si un message arrive sur un canal dont l'adaptateur n'est pas enregistré, le moteur doit loguer l'erreur et ignorer (ne pas crasher). `ChannelAdapterRegistry.get()` retourne null au lieu de throw en mode dégradé.

### 13.4 Événements perdus au démarrage
Si le serveur redémarre pendant qu'une session est `waiting_delay` ou `waiting_reply`, les setTimeout sont perdus. `FlowSessionCleanerJob` (au démarrage) doit scanner les sessions actives et les reprendre ou les expirer selon leur âge.

### 13.5 Cohabitation double-message
Pendant la migration (Phases 1-3), `auto-message-master` et FlowBot peuvent viser la même conversation. Protection : `InboundMessageService` lit `whatsapp_chat.active_flow_session_id` avant d'émettre `'bot.inbound'`. Si une session FlowBot est active, ne pas émettre → `auto-message-master` ne déclenche pas non plus.

---

## 14. APIs exposées

```
# Gestion des flows
GET    /flowbot                    Liste + métriques
POST   /flowbot                    Créer
GET    /flowbot/:id                Détail
PUT    /flowbot/:id                Modifier métadonnées
DELETE /flowbot/:id                Supprimer
PATCH  /flowbot/:id/activate       Activer / Désactiver
PUT    /flowbot/:id/graph          Sauvegarder graph complet (nœuds + arêtes)
GET    /flowbot/:id/graph          Récupérer graph pour le canvas
POST   /flowbot/:id/test           Simuler sur conversation fictive

# Import / Export
GET    /flowbot/:id/export         JSON exportable
POST   /flowbot/import             Importer depuis JSON
GET    /flowbot/presets            Flows prédéfinis (A-I + séquence)
POST   /flowbot/presets/:name/install  Installer un flow prédéfini

# Sessions
GET    /flowbot/sessions           Liste (filtrables par status, flow, contact)
GET    /flowbot/sessions/:id       Détail + log complet
DELETE /flowbot/sessions/:id       Annuler (escalade forcée)

# Analytics
GET    /flowbot/analytics          Dashboard global
GET    /flowbot/:id/analytics      Dashboard par flow
GET    /flowbot/:id/nodes/:nid/stats  Stats d'un nœud

# Contacts FlowBot (lecture seule depuis l'admin)
GET    /flowbot/contacts           Liste des contacts FlowBot
GET    /flowbot/contacts/:id       Historique d'un contact (sessions, messages)
```
