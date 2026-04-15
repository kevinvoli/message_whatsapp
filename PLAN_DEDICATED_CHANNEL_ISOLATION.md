# Plan — Context-Driven Messaging Platform
# (version finale 2026-04-15)

---

## Vision

> Le système devient une **plateforme conversationnelle orientée contexte**,
> comparable à Intercom / Zendesk / HubSpot Conversations.

```
Client (WhatsappChat — 1 par client)
   └── ChatContext (N — 1 par contexte actif)
              ├── Context  ← entité pivot universelle
              ├── Poste
              ├── Provider
              ├── Channel
              └── Bot / Auto-message
```

Le **contexte** devient la dimension métier centrale.
Il est indépendant du canal, du poste et du provider.
Tout l'état par-canal (auto-messages, tracking, lock) vit dans `ChatContext`.

---

## Problème actuel

### Couplage rigide

Aujourd'hui le système est structuré autour de :

```
channel → poste
message → channel
chat    → poste
```

Ce couplage provoque deux bugs critiques :

**Bug 1 — Mauvais lookup**

```ts
findOne({ where: { chat_id: clientPhone } })
// → retourne la conversation pool existante quand le client écrit sur un canal dédié
// → auto_message_step déjà > 0 → messages auto jamais déclenchés
```

**Bug 2 — Corruption des compteurs**

```
Pool → auto_message_step = 3
Dédié → ChatContext créé, step = 0 → orchestrateur envoie step 1
  → update(chat_id, { auto_message_step: 1 })
  → ⚠️ pool.auto_message_step passe aussi à 1   ← corruption
Client reécrit pool → reprend à step 2 au lieu de 4
```

La cause racine : `chatService.update(chat_id, ...)` écrase **toutes** les conversations
du client en même temps car `chat_id` n'est pas unique par contexte.

---

## Règles métier

| Cas | Comportement attendu |
|-----|----------------------|
| Client écrit canal dédié A | `ChatContext` propre à A, jamais fusionné avec le pool |
| Client écrit canal dédié B ensuite | `ChatContext` propre à B, séparé de A et du pool |
| Client écrit canaux normaux | `ChatContext` pool — comportement inchangé |
| Poste dédié | Ne voit que les `ChatContext` de son contexte |
| Poste pool | Ne voit jamais les `ChatContext` dédiés |
| Premier message canal dédié | Nouveau `ChatContext` → compteurs à zéro → messages auto déclenchés naturellement |
| Client actif pool + dédié simultanément | Deux `ChatContext` parallèles indépendants sur la même `WhatsappChat` |
| Même canal → plusieurs contextes | Possible via `ContextBinding` multiples |
| Provider entier → contexte spécifique | Possible via `ContextBinding` de type `provider` |
| Changer un canal de contexte | Zéro impact DB — modifier le `ContextBinding` suffit |
| Activer un bot sur un contexte | Immédiat — changer `context.config.bot_enabled = true` |

---

## Architecture — 3 nouvelles entités

### Entité 1 : `Context` — définition métier

```ts
@Entity('contexts')
@Index('UQ_context_code', ['code'], { unique: true })
export class Context {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  code: string;
  // Exemples : 'pool', 'support', 'recrutement', 'vip', 'reclamations'

  @Column({ length: 150 })
  label: string;

  @Column({ default: true })
  is_active: boolean;

  // Config extensible — tout paramètre métier futur va ici
  @Column({ type: 'json', nullable: true })
  config?: {
    auto_assign?: boolean;   // assigner automatiquement au premier poste libre
    priority?: number;       // ordre de traitement (1 = plus prioritaire)
    bot_enabled?: boolean;   // activer un bot sur ce contexte
    bot_id?: string;         // ID du bot à utiliser
    sla_minutes?: number;    // SLA spécifique à ce contexte
    [key: string]: unknown;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

---

### Entité 2 : `ContextBinding` — liaison universelle

C'est la clé de l'extensibilité du système.
Un contexte peut être lié à un canal, un poste OU un provider.

```ts
@Entity('context_bindings')
@Index('UQ_binding', ['context_id', 'entity_type', 'entity_id'], { unique: true })
@Index('IDX_binding_lookup', ['entity_type', 'entity_id'])
export class ContextBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Context)
  @JoinColumn({ name: 'context_id' })
  context?: Context;

  @Column()
  context_id: string;

  @Column({ type: 'enum', enum: ['channel', 'poste', 'provider'] })
  entity_type: 'channel' | 'poste' | 'provider';

  @Column({ length: 100 })
  entity_id: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Exemples de bindings :**

```jsonc
// Canal WhatsApp recrutement → contexte recrutement
{ "entity_type": "channel", "entity_id": "WA_recrutement", "context_id": "ctx-recrut" }

// Poste RH → contexte recrutement (fallback si pas de binding canal)
{ "entity_type": "poste",   "entity_id": "poste_rh",       "context_id": "ctx-recrut" }

// Tout le provider Messenger → contexte support
{ "entity_type": "provider","entity_id": "messenger",       "context_id": "ctx-support" }

// Canal normal → contexte pool
{ "entity_type": "channel", "entity_id": "WA_standard",    "context_id": "ctx-pool" }
```

---

### Entité 3 : `ChatContext` — état par client × contexte

```ts
@Entity('chat_contexts')
@Index('UQ_chat_context', ['chat_uuid', 'context_id'], { unique: true })
@Index('IDX_chatctx_poste_updated', ['poste_id', 'updated_at'])
export class ChatContext {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Lien conversation ──────────────────────────────────────────
  @Column({ type: 'char', length: 36 })
  chat_uuid: string;
  // FK → whatsapp_chats.id ON DELETE CASCADE

  @Column({ type: 'char', length: 36 })
  context_id: string;
  // FK → contexts.id

  @ManyToOne(() => Context)
  @JoinColumn({ name: 'context_id' })
  context?: Context;

  // ── Assignation ────────────────────────────────────────────────
  @Column({ nullable: true, type: 'char', length: 36 })
  poste_id: string | null;

  // ── Auto-message séquence ──────────────────────────────────────
  @Column({ default: 0 })
  auto_message_step: number;

  @Column({ default: false })
  waiting_client_reply: boolean;

  @Column({ nullable: true })
  last_auto_message_sent_at: Date | null;

  @Column({ default: false })
  read_only: boolean;
  // Lock pendant l'exécution d'un auto-message — isolé par contexte

  // ── Trigger A — no_response ────────────────────────────────────
  @Column({ default: 0 })
  no_response_auto_step: number;

  @Column({ nullable: true })
  last_no_response_auto_sent_at: Date | null;

  // ── Trigger C — out_of_hours ───────────────────────────────────
  @Column({ default: false })
  out_of_hours_auto_sent: boolean;

  // ── Trigger D — reopened ───────────────────────────────────────
  @Column({ nullable: true })
  reopened_at: Date | null;

  @Column({ default: false })
  reopened_auto_sent: boolean;

  // ── Trigger E — queue_wait ─────────────────────────────────────
  @Column({ default: 0 })
  queue_wait_auto_step: number;

  @Column({ nullable: true })
  last_queue_wait_auto_sent_at: Date | null;

  // ── Trigger F — keyword ────────────────────────────────────────
  @Column({ nullable: true })
  keyword_auto_sent_at: Date | null;

  // ── Trigger G — client_type ────────────────────────────────────
  @Column({ default: false })
  client_type_auto_sent: boolean;

  // ── Trigger H — inactivity ─────────────────────────────────────
  @Column({ default: 0 })
  inactivity_auto_step: number;

  @Column({ nullable: true })
  last_inactivity_auto_sent_at: Date | null;

  // ── Trigger I — on_assign ──────────────────────────────────────
  @Column({ default: false })
  on_assign_auto_sent: boolean;

  // ── Timestamps ─────────────────────────────────────────────────
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

---

## Résolution du contexte — `ContextResolverService`

### Priorité stricte

```
canal (channel_id) > poste (poste_id) > provider > default (pool)
```

### Implémentation

```ts
@Injectable()
export class ContextResolverService {
  constructor(
    @InjectRepository(ContextBinding)
    private readonly bindingRepo: Repository<ContextBinding>,
    @InjectRepository(Context)
    private readonly contextRepo: Repository<Context>,
  ) {}

  /**
   * Résout le contexte à partir d'un message entrant.
   * Ordre de priorité : channel > poste > provider > pool
   *
   * ⚡ Doit être caché (Redis) — appelé à chaque message entrant.
   */
  async resolveForChannel(
    channelId: string,
    provider?: string,
    posteId?: string,
  ): Promise<Context> {
    // 1. Binding channel (priorité max)
    const byChannel = await this.findBinding('channel', channelId);
    if (byChannel) {
      this.log('channel', channelId, byChannel.context_id);
      return byChannel.context!;
    }

    // 2. Binding poste
    if (posteId) {
      const byPoste = await this.findBinding('poste', posteId);
      if (byPoste) {
        this.log('poste', posteId, byPoste.context_id);
        return byPoste.context!;
      }
    }

    // 3. Binding provider
    if (provider) {
      const byProvider = await this.findBinding('provider', provider);
      if (byProvider) {
        this.log('provider', provider, byProvider.context_id);
        return byProvider.context!;
      }
    }

    // 4. Fallback pool
    const pool = await this.contextRepo.findOneOrFail({ where: { code: 'pool' } });
    this.log('fallback', channelId, pool.id);
    return pool;
  }

  private async findBinding(type: string, entityId: string): Promise<ContextBinding | null> {
    return this.bindingRepo.findOne({
      where: { entity_type: type as any, entity_id: entityId, is_active: true },
      relations: ['context'],
    });
  }

  /**
   * Log systématique : channel → context
   * Facilite le debug en production.
   */
  private log(source: string, entityId: string, contextId: string) {
    logger.debug('Context resolved', { source, entityId, contextId });
  }
}
```

> **Point critique — Performance** : `resolveForChannel` est appelé à chaque message entrant.
> En production avec fort volume, mettre en cache Redis avec TTL 60 s :
> `key = "ctx:channel:{channelId}"` → `contextId`.
> Invalider le cache quand un `ContextBinding` est modifié.

---

## `MessageAuto` — ajout de `context_id`

Les messages auto peuvent être scopés par contexte, en plus du poste et du canal.

```ts
// Dans message-auto.entity.ts — ajouter :
@Column({ nullable: true, type: 'char', length: 36 })
context_id?: string | null;
```

**Priorité de sélection dans `getTemplateForTrigger` :**

```ts
async getTemplateForTrigger(
  trigger: AutoMessageTriggerType,
  step: number,
  options?: {
    posteId?: string | null;
    channelId?: string | null;
    contextId?: string | null;   // ← nouveau
  },
): Promise<MessageAuto | null> {
  // Priorité : poste > canal > contexte > global
  return (
    (options?.posteId   && await this.findTemplate(trigger, step, 'poste',   options.posteId))   ||
    (options?.channelId && await this.findTemplate(trigger, step, 'channel', options.channelId)) ||
    (options?.contextId && await this.findTemplate(trigger, step, 'context', options.contextId)) ||
    await this.findTemplate(trigger, step, null, null)
  );
}
```

Exemples de templates scopés par contexte :

```
context = recrutement → bot RH → messages auto RH (différents du support)
context = vip         → messages prioritaires, délai réduit
context = support     → messages auto standard
```

---

## Flux complet d'un message entrant (après plan)

```
Webhook arrive → InboundMessageService
      ↓
message.channelId, message.provider connus
      ↓
ContextResolverService.resolveForChannel(channelId, provider)
      ↓  (log: channel → context)
Context résolu (ex: 'recrutement')
      ↓
WhatsappChat = findOrCreate({ chat_id: phone })
  ← 1 seule ligne par client — inchangé
      ↓
ChatContext = findOrCreate({ chat_uuid: chat.id, context_id: context.id })
  ← nouveau si premier message sur ce contexte → compteurs à zéro
  ← existant si déjà connu → continuer où on s'était arrêté
      ↓
dispatcherService.assignPoste(chatContext)
  ← poste dédié si context lié à un poste dédié
  ← queue pool sinon
      ↓
contextService.updateChatContext(chatContext.id, {
  read_only: false,
  last_client_message_at: clientMessageAt,
  waiting_client_reply: false,
})
      ↓
autoMessageOrchestrator.handleClientMessage(chat, chatContext)
  ← lock sur chatContext.id — isolation parfaite
```

### Deux contextes parallèles — garantie d'isolation

```
Base de données :

whatsapp_chats:
  id (UUID)  | chat_id        | poste_id
  uuid-chat  | 336…@s.wa.net  | poste_pool

chat_contexts:
  id          | chat_uuid | context_id    | poste_id     | auto_message_step | read_only
  uuid-ctx-A  | uuid-chat | ctx_pool      | poste_pool   | 3                 | false
  uuid-ctx-B  | uuid-chat | ctx_recrut    | poste_dedie  | 1                 | false

Message sur canal "produits" (normal)
→ resolve → context = pool → chatContext = uuid-ctx-A
→ updateChatContext(uuid-ctx-A, {...}) → pool intact ✅

Message sur canal "recrutement" (dédié)
→ resolve → context = recrutement → chatContext = uuid-ctx-B
→ updateChatContext(uuid-ctx-B, {...}) → pool intact ✅
```

---

## Migration BDD — `20260415_create_context_tables.ts`

```ts
export class CreateContextTables1776297600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── 1. Table contexts ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE contexts (
        id         CHAR(36)     NOT NULL,
        code       VARCHAR(100) NOT NULL,
        label      VARCHAR(150) NOT NULL,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        config     JSON         NULL,
        createdAt  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_context_code (code)
      ) ENGINE=InnoDB
    `);

    // ── 2. Table context_bindings ──────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE context_bindings (
        id          CHAR(36)    NOT NULL,
        context_id  CHAR(36)    NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id   VARCHAR(100) NOT NULL,
        is_active   TINYINT(1)  NOT NULL DEFAULT 1,
        createdAt   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_binding (context_id, entity_type, entity_id),
        INDEX IDX_binding_lookup (entity_type, entity_id),
        CONSTRAINT FK_binding_context FOREIGN KEY (context_id) REFERENCES contexts(id)
      ) ENGINE=InnoDB
    `);

    // ── 3. Table chat_contexts ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE chat_contexts (
        id                            CHAR(36)    NOT NULL,
        chat_uuid                     CHAR(36)    NOT NULL,
        context_id                    CHAR(36)    NOT NULL,
        poste_id                      CHAR(36)    NULL,
        auto_message_step             INT         NOT NULL DEFAULT 0,
        waiting_client_reply          TINYINT(1)  NOT NULL DEFAULT 0,
        last_auto_message_sent_at     DATETIME(6) NULL,
        read_only                     TINYINT(1)  NOT NULL DEFAULT 0,
        no_response_auto_step         INT         NOT NULL DEFAULT 0,
        last_no_response_auto_sent_at DATETIME(6) NULL,
        out_of_hours_auto_sent        TINYINT(1)  NOT NULL DEFAULT 0,
        reopened_at                   DATETIME(6) NULL,
        reopened_auto_sent            TINYINT(1)  NOT NULL DEFAULT 0,
        queue_wait_auto_step          INT         NOT NULL DEFAULT 0,
        last_queue_wait_auto_sent_at  DATETIME(6) NULL,
        keyword_auto_sent_at          DATETIME(6) NULL,
        client_type_auto_sent         TINYINT(1)  NOT NULL DEFAULT 0,
        inactivity_auto_step          INT         NOT NULL DEFAULT 0,
        last_inactivity_auto_sent_at  DATETIME(6) NULL,
        on_assign_auto_sent           TINYINT(1)  NOT NULL DEFAULT 0,
        created_at                    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at                    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_chat_context (chat_uuid, context_id),
        INDEX IDX_chatctx_poste_updated (poste_id, updated_at),
        CONSTRAINT FK_chatctx_chat    FOREIGN KEY (chat_uuid)  REFERENCES whatsapp_chats(id) ON DELETE CASCADE,
        CONSTRAINT FK_chatctx_context FOREIGN KEY (context_id) REFERENCES contexts(id)
      ) ENGINE=InnoDB
    `);

    // ── 4. Créer contexte pool par défaut ─────────────────────────
    await queryRunner.query(`
      INSERT INTO contexts (id, code, label, config)
      VALUES (UUID(), 'pool', 'Pool global', '{"priority": 0, "auto_assign": true}')
    `);

    // ── 5. Lier tous les canaux non-dédiés au contexte pool ────────
    await queryRunner.query(`
      INSERT INTO context_bindings (id, context_id, entity_type, entity_id)
      SELECT UUID(), (SELECT id FROM contexts WHERE code = 'pool'), 'channel', ch.channel_id
      FROM whapi_channels ch
      WHERE ch.poste_id IS NULL
    `);
    -- Les canaux dédiés (poste_id IS NOT NULL) reçoivent leur binding via l'admin
    -- après création manuelle du Context métier (recrutement, support, etc.)

    // ── 6. Migrer les chats existants → ChatContext pool ──────────
    // Copie tous les compteurs actuels — zéro perte de données
    await queryRunner.query(`
      INSERT INTO chat_contexts (
        id, chat_uuid, context_id, poste_id,
        auto_message_step, waiting_client_reply, last_auto_message_sent_at, read_only,
        no_response_auto_step, last_no_response_auto_sent_at,
        out_of_hours_auto_sent,
        reopened_at, reopened_auto_sent,
        queue_wait_auto_step, last_queue_wait_auto_sent_at,
        keyword_auto_sent_at, client_type_auto_sent,
        inactivity_auto_step, last_inactivity_auto_sent_at,
        on_assign_auto_sent
      )
      SELECT
        UUID(), c.id, (SELECT id FROM contexts WHERE code = 'pool'), c.poste_id,
        c.auto_message_step, c.waiting_client_reply, c.last_auto_message_sent_at, 0,
        c.no_response_auto_step, c.last_no_response_auto_sent_at,
        c.out_of_hours_auto_sent,
        c.reopened_at, c.reopened_auto_sent,
        c.queue_wait_auto_step, c.last_queue_wait_auto_sent_at,
        c.keyword_auto_sent_at, c.client_type_auto_sent,
        c.inactivity_auto_step, c.last_inactivity_auto_sent_at,
        c.on_assign_auto_sent
      FROM whatsapp_chats c
      WHERE c.deletedAt IS NULL
    `);

    // ── 7. Ajouter context_id sur whatsapp_messages ───────────────
    await queryRunner.query(`
      ALTER TABLE whatsapp_messages
        ADD COLUMN context_id CHAR(36) NULL,
        ADD INDEX IDX_message_context (context_id),
        ADD CONSTRAINT FK_msg_context FOREIGN KEY (context_id) REFERENCES contexts(id)
    `);

    // Backfill : tous les messages existants → pool
    await queryRunner.query(`
      UPDATE whatsapp_messages
      SET context_id = (SELECT id FROM contexts WHERE code = 'pool')
      WHERE context_id IS NULL
    `);

    // ── 8. Ajouter context_id sur message_auto ────────────────────
    await queryRunner.query(`
      ALTER TABLE message_auto
        ADD COLUMN context_id CHAR(36) NULL,
        ADD INDEX IDX_msgauto_context (context_id),
        ADD CONSTRAINT FK_msgauto_context FOREIGN KEY (context_id) REFERENCES contexts(id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE message_auto DROP FOREIGN KEY FK_msgauto_context`);
    await queryRunner.query(`ALTER TABLE message_auto DROP COLUMN context_id`);
    await queryRunner.query(`ALTER TABLE whatsapp_messages DROP FOREIGN KEY FK_msg_context`);
    await queryRunner.query(`ALTER TABLE whatsapp_messages DROP COLUMN context_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS chat_contexts`);
    await queryRunner.query(`DROP TABLE IF EXISTS context_bindings`);
    await queryRunner.query(`DROP TABLE IF EXISTS contexts`);
  }
}
```

> **Zéro perte de données.** `whatsapp_chats` n'est pas modifié structurellement.
> Le `read_only` est forcé à `0` au moment de la migration — les locks en cours
> au moment du déploiement sont abandonnés (comportement acceptable).

---

## Fichiers à créer / modifier

### Nouveaux fichiers à créer

```
src/context/entities/context.entity.ts
src/context/entities/context-binding.entity.ts
src/context/entities/chat-context.entity.ts
src/context/context-resolver.service.ts     ← resolveForChannel
src/context/context.service.ts              ← findOrCreateChatContext, updateChatContext
src/context/context.module.ts
src/database/migrations/20260415_create_context_tables.ts
```

### `context.service.ts` — méthodes complètes

```ts
@Injectable()
export class ContextService {

  // Récupère ou crée le ChatContext pour (chat.id, context.id)
  async findOrCreateChatContext(chatUuid: string, contextId: string): Promise<ChatContext>

  // Rechargement par UUID (remplace chatService.findBychat_id dans l'orchestrateur)
  async findChatContextById(id: string): Promise<ChatContext | null>

  // Liste les ChatContext d'un poste (remplace chatService.findByPosteId)
  async findChatContextsByPoste(
    posteId: string,
    cursor?: { updatedAt: string; id: string },
    limit?: number,
  ): Promise<{ contexts: ChatContext[]; hasMore: boolean }>

  // Mise à jour scopée — avec réinitialisations automatiques des cycles
  async updateChatContext(id: string, data: Partial<ChatContext>): Promise<void> {
    // Trigger A : agent répond → cycle no_response repart de zéro
    if ('last_poste_message_at' in data) {
      data.no_response_auto_step = 0;
      data.last_no_response_auto_sent_at = null;
    }
    // Trigger E : conversation assignée → cycle queue_wait repart de zéro
    if (data.poste_id !== undefined && data.poste_id !== null) {
      data.queue_wait_auto_step = 0;
      data.last_queue_wait_auto_sent_at = null;
      data.on_assign_auto_sent = false;
    }
    // Trigger H : toute activité → cycle inactivity repart de zéro
    if ('last_activity_at' in data) {
      data.inactivity_auto_step = 0;
      data.last_inactivity_auto_sent_at = null;
    }
    await this.chatContextRepo.update({ id }, data);
  }
}
```

---

## Inventaire complet des `chatService.update(chat_id, ...)` à migrer

| Fichier | ~Ligne | Champs mis à jour | Migration |
|---------|--------|------------------|-----------|
| `inbound-message.service.ts` | 174 | `read_only`, `last_client_message_at`, `waiting_client_reply`, `auto_message_step` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `auto-message-orchestrator.ts` | 160 | `read_only: true` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `auto-message-orchestrator.ts` | 205, 226 | `read_only: false` (timeout / erreur) | → `contextService.updateChatContext(chatContext.id, ...)` |
| `auto-message-orchestrator.ts` | 278 | `read_only: false` (fenêtre 23h) | → `contextService.updateChatContext(chatContext.id, ...)` |
| `auto-message-orchestrator.ts` | 302 | `auto_message_step`, `waiting_client_reply`, `last_auto_message_sent_at` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `message-auto.service.ts` | 198 | Tracking trigger (`updateTriggerTracking`) | → `contextService.updateChatContext(chatContext.id, ...)` |
| `message-auto.service.ts` | 273 | Divers par trigger | → `contextService.updateChatContext(chatContext.id, ...)` |
| `message-auto.service.ts` | 330 | `auto_message_status: 'sending'` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `message-auto.service.ts` | 354 | `read_only`, `auto_message_status` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `message-auto.service.ts` | 364 | `read_only: false`, `auto_message_status: 'failed'` | → `contextService.updateChatContext(chatContext.id, ...)` |
| `whatsapp_message.gateway.ts` | 586 | `status: newStatus` | **Rester sur `chatService`** — statut global du chat, pas par contexte |
| `whatsapp_chat.service.ts` | `lockConversation` | `read_only: true` | → `contextService.updateChatContext(chatContext.id, { read_only: true })` |
| `whatsapp_chat.service.ts` | `unlockConversation` | `read_only: false` | → `contextService.updateChatContext(chatContext.id, { read_only: false })` |

> **Règle** : tout ce qui est état-par-canal/contexte → `ChatContext`.
> Tout ce qui est état global (status, name, poste principal actif) → `WhatsappChat`.

---

## Ordre d'implémentation recommandé

```
Étape 1 — Entités + module
   src/context/entities/context.entity.ts
   src/context/entities/context-binding.entity.ts
   src/context/entities/chat-context.entity.ts
   src/context/context.module.ts

Étape 2 — Services
   src/context/context-resolver.service.ts  (resolveForChannel + log)
   src/context/context.service.ts           (findOrCreate, update, findByPoste)

Étape 3 — Migration BDD
   20260415_create_context_tables.ts        (tables + backfill + message_auto.context_id)

Étape 4 — Dispatcher
   dispatcher.service.ts                    (retourner { chat, chatContext })

Étape 5 — Inbound
   inbound-message.service.ts              (passer chatContext aux services aval)

Étape 6 — Orchestrateur
   auto-message-orchestrator.ts            (lock sur chatContext.id)

Étape 7 — Auto-message
   message-auto.service.ts                 (sendAutoMessage + updateTriggerTracking par chatContextId)
   message-auto.entity.ts                  (ajouter context_id)

Étape 8 — Gateway
   whatsapp_message.gateway.ts             (sendConversationsToClientInternal avec ChatContext)
```

---

## Points de vigilance

| Point | Détail |
|-------|--------|
| **Performance — résolution contexte** | `resolveForChannel` est appelé à chaque message entrant. Mettre en cache Redis : `key = "ctx:channel:{channelId}"` TTL 60 s. Invalider à chaque modification de `ContextBinding`. |
| **Cohérence — 1 contexte par message** | Un message entrant = 1 seul contexte résolu. Jamais ambigu si la priorité `channel > poste > provider > pool` est respectée. |
| **Log systématique** | Toujours logger `channel → context` à la résolution. Essentiel pour debug en production. Format : `{ source: 'channel', entityId, contextId }`. |
| **Mutex `getChatMutex(chatId)`** | Conservé sur `chat_id` dans `InboundMessageService` — protège la création du `WhatsappChat`. Le lock interne de l'orchestrateur passe sur `chatContext.id`. |
| **Champs legacy sur `WhatsappChat`** | `auto_message_step`, `waiting_client_reply`, `read_only`… restent présents pour compatibilité ascendante. Les écritures passent par `ChatContext`. Supprimer en phase ultérieure via migration dédiée. |
| **FK `chat_contexts.chat_uuid ON DELETE CASCADE`** | Si un `WhatsappChat` est supprimé, tous ses `ChatContext` le sont aussi. Vérifier si le soft-delete doit aussi cascader (ajouter trigger ou logique applicative). |
| **`reinjectConversation`** | Utilise `chat.channel_id`. Après ce plan, utiliser `chatContext.context_id` pour identifier le contexte exact. |
| **Canaux dédiés existants** | Créer manuellement les `Context` métier via l'admin, puis créer les `ContextBinding` pour chaque canal dédié. La migration ne le fait pas automatiquement (contexte métier = décision humaine). |
| **Frontend** | 1 `WhatsappChat` = 1 conversation principale affichée. Les `ChatContext` sont des sous-vues filtrées : `WHERE context_id = X`. Prévoir filtre contextuel dans la sidebar. |

---

## Cas d'usage avancés débloqués par cette architecture

| Cas | Comment |
|-----|---------|
| Bot RH dédié sur canal recrutement | `context.config.bot_enabled = true` + `context.config.bot_id = 'bot_rh'` |
| Messages auto différents par contexte | `message_auto.context_id` scoped → templates RH vs support vs VIP |
| Prioritisation VIP | `context.config.priority = 1` → dispatcher traite en premier |
| Campagne marketing | Nouveau `Context` + `ContextBinding` canal → compteurs isolés |
| Scoring IA / segmentation | `context.config` extensible → ajouter `ml_model_id`, `segment` |
| Multi-tenant avancé | `ContextBinding` scopé par `tenant_id` sur le binding |
| Changer canal de contexte | Modifier `ContextBinding` → zéro impact DB, actif immédiatement |

---

## Résultat final

```
Avant :
  channel → poste → chat_id → update(chat_id)  ← corruption possible

Après :
  channel → ContextBinding → Context → ChatContext(uuid) → updateChatContext(uuid)
                                                              ← isolation garantie
```

> Architecture **"Context-Driven Messaging Platform"** — robuste, modulaire, extensible.
> Prête pour bots IA, multi-providers, segmentation marketing et SLA différenciés.
