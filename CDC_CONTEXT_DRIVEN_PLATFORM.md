# Cahier des charges — Context-Driven Messaging Platform
## Basé sur `PLAN_DEDICATED_CHANNEL_ISOLATION.md` — Version 2026-04-15

---

## Résumé exécutif

### Problème à résoudre

Le système actuel souffre d'un **couplage rigide** entre `channel → poste → WhatsappChat` :

```
chatService.update(chat_id, { auto_message_step: X })
  → met à jour TOUTES les conversations du client en même temps
  → Pool canal A est corrompu quand le client écrit sur canal dédié B
```

Deux bugs critiques en production :
1. **Bug lookup** : un client qui écrit sur un canal dédié récupère le `WhatsappChat` du pool → les compteurs sont déjà avancés → les messages auto FlowBot ne se déclenchent pas
2. **Bug corruption** : une mise à jour sur le contexte B écrase l'état du contexte A

### Solution

Introduire une couche **Context** entre le canal et le chat :

```
Avant :  channel → poste → WhatsappChat.update(chat_id, ...)  ← corruption
Après :  channel → ContextBinding → Context → ChatContext(uuid) → updateChatContext(uuid)
                                                                  ← isolation garantie
```

### Impact

- Zéro refactoring du frontend dans un premier temps
- Zéro perte de données (migration avec backfill)
- Compatible avec l'architecture FlowBot existante
- Débloque les cas multi-contextes, bots par contexte, SLA différenciés

---

## Architecture cible

```
WhatsappChat (1 par client)
   └── ChatContext  (N — 1 par contexte actif)
          ├── context_id  → Context (définition métier : pool/support/recrutement/vip)
          ├── poste_id    → WhatsappPoste (assignation)
          └── [tous les compteurs d'état : auto_step, read_only, waiting_reply…]

WhapiChannel / WhatsappPoste / Provider
   └── ContextBinding  (liaison vers un Context)
```

---

## Contraintes techniques

| Contrainte | Détail |
|-----------|--------|
| **DB** | MySQL / TypeORM — migrations versionnées dans `src/database/migrations/` |
| **Zéro downtime** | Migration additive uniquement — aucune colonne supprimée sur `WhatsappChat` |
| **Tests** | Toute logique métier dans un service = doit avoir un spec |
| **Branche** | Feature branch `feature/context-driven-platform` depuis `master` |
| **Performance** | `resolveForChannel` est hot-path — doit être < 5 ms en prod (cache Redis) |
| **Legacy FlowBot** | `BotConversation.chatRef` reste tel quel — pas dans le scope de ce plan |
| **Message-auto** | Tables legacy supprimées — les références `message_auto` dans le plan → adaptées à FlowBot |

---

## Découpage en Epics et Tickets

```
EPIC A — Infrastructure (entités + migration)       CTX-A1 à CTX-A5
EPIC B — Services métier                            CTX-B1 à CTX-B4
EPIC C — Intégration pipeline entrant               CTX-C1 à CTX-C4
EPIC D — Intégration FlowBot                        CTX-D1 à CTX-D3
EPIC E — Interface admin                            CTX-E1 à CTX-E4
EPIC F — Performance & tests                        CTX-F1 à CTX-F3
```

---

## EPIC A — Infrastructure : Entités + Migration

---

### CTX-A1 — Entité `Context`

**Type** : Backend — Nouvelle entité TypeORM  
**Dépendances** : Aucune  
**Effort estimé** : S (2h)

#### Description

Créer l'entité `Context` qui représente une **définition métier** d'un contexte de communication.
Exemples : `pool`, `support`, `recrutement`, `vip`, `reclamations`.

#### Fichier à créer

`src/context/entities/context.entity.ts`

```typescript
@Entity('contexts')
@Index('UQ_context_code', ['code'], { unique: true })
export class Context {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  code: string;
  // Identifiant métier stable : 'pool', 'support', 'recrutement', 'vip'

  @Column({ length: 150 })
  label: string;
  // Nom affichable : 'Pool global', 'Support technique', 'Recrutement'

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  config?: {
    auto_assign?: boolean;  // assigner automatiquement au premier poste libre
    priority?: number;      // ordre de traitement (1 = plus prioritaire)
    bot_enabled?: boolean;  // activer FlowBot sur ce contexte
    bot_flow_id?: string;   // ID du FlowBot à utiliser pour ce contexte
    sla_minutes?: number;   // SLA spécifique à ce contexte
    [key: string]: unknown;
  };

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  @OneToMany(() => ContextBinding, b => b.context)
  bindings?: ContextBinding[];
}
```

#### Critères d'acceptation

- [ ] L'entité se synchronise correctement avec TypeORM (`tsc --noEmit` passe)
- [ ] Index unique sur `code` (empêche deux contextes avec le même code)
- [ ] Le champ `config` est nullable et extensible (JSON)
- [ ] `createdAt` / `updatedAt` auto-gérés

---

### CTX-A2 — Entité `ContextBinding`

**Type** : Backend — Nouvelle entité TypeORM  
**Dépendances** : CTX-A1  
**Effort estimé** : S (2h)

#### Description

Créer l'entité `ContextBinding` qui **lie** un canal, un poste ou un provider à un `Context`.
C'est la table de routage : à partir d'un `channelId`, on trouve le `Context` applicable.

#### Fichier à créer

`src/context/entities/context-binding.entity.ts`

```typescript
export type BindingEntityType = 'channel' | 'poste' | 'provider';

@Entity('context_bindings')
@Index('UQ_binding', ['context_id', 'entity_type', 'entity_id'], { unique: true })
@Index('IDX_binding_lookup', ['entity_type', 'entity_id'])
export class ContextBinding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'context_id', type: 'char', length: 36 })
  context_id: string;

  @ManyToOne(() => Context, c => c.bindings)
  @JoinColumn({ name: 'context_id' })
  context?: Context;

  @Column({
    name: 'entity_type',
    type: 'enum',
    enum: ['channel', 'poste', 'provider'],
  })
  entity_type: BindingEntityType;

  @Column({ name: 'entity_id', length: 100 })
  entity_id: string;
  // channel_id, poste_id, ou nom du provider ('whapi', 'meta', 'telegram')

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
```

#### Critères d'acceptation

- [ ] Index composite unique sur `(context_id, entity_type, entity_id)`
- [ ] Index de lookup sur `(entity_type, entity_id)` pour les requêtes fréquentes
- [ ] Relation `ManyToOne` vers `Context`
- [ ] `entity_id` accepte `varchar(100)` (channel_id peut être long)

---

### CTX-A3 — Entité `ChatContext`

**Type** : Backend — Nouvelle entité TypeORM  
**Dépendances** : CTX-A1  
**Effort estimé** : M (4h)

#### Description

Créer l'entité `ChatContext` qui stocke l'**état par client × contexte**.
C'est le remplacement de tous les compteurs qui étaient sur `WhatsappChat` et qui causaient les corruptions.

#### Fichier à créer

`src/context/entities/chat-context.entity.ts`

```typescript
@Entity('chat_contexts')
@Index('UQ_chat_context', ['chat_uuid', 'context_id'], { unique: true })
@Index('IDX_chatctx_poste_updated', ['poste_id', 'updatedAt'])
@Index('IDX_chatctx_context_updated', ['context_id', 'updatedAt'])
export class ChatContext {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Lien conversation ──────────────────────────────────────────────────────
  @Column({ name: 'chat_uuid', type: 'char', length: 36 })
  chat_uuid: string;
  // FK → whatsapp_chats.id ON DELETE CASCADE

  @Column({ name: 'context_id', type: 'char', length: 36 })
  context_id: string;

  @ManyToOne(() => Context)
  @JoinColumn({ name: 'context_id' })
  context?: Context;

  // ── Assignation ────────────────────────────────────────────────────────────
  @Column({ name: 'poste_id', nullable: true, type: 'char', length: 36 })
  poste_id: string | null;

  // ── État lecture / lock ────────────────────────────────────────────────────
  @Column({ name: 'read_only', default: false })
  read_only: boolean;
  // Lock pendant l'exécution d'un auto-message — isolé par contexte

  @Column({ name: 'waiting_client_reply', default: false })
  waiting_client_reply: boolean;

  // ── Timestamps d'activité ──────────────────────────────────────────────────
  @Column({ name: 'last_client_message_at', type: 'datetime', nullable: true })
  last_client_message_at: Date | null;

  @Column({ name: 'last_poste_message_at', type: 'datetime', nullable: true })
  last_poste_message_at: Date | null;
  // Mise à jour quand l'agent répond → réinitialise les cycles no_response

  @Column({ name: 'last_activity_at', type: 'datetime', nullable: true })
  last_activity_at: Date | null;
  // max(last_client_message_at, last_poste_message_at) → reset inactivity

  // ── FlowBot séquences ──────────────────────────────────────────────────────
  @Column({ name: 'flow_session_id', type: 'char', length: 36, nullable: true })
  flow_session_id: string | null;
  // Référence souple vers FlowSession active sur ce contexte

  // ── Trigger : no_response ──────────────────────────────────────────────────
  @Column({ name: 'no_response_auto_step', default: 0 })
  no_response_auto_step: number;

  @Column({ name: 'last_no_response_auto_sent_at', type: 'datetime', nullable: true })
  last_no_response_auto_sent_at: Date | null;

  // ── Trigger : out_of_hours ─────────────────────────────────────────────────
  @Column({ name: 'out_of_hours_auto_sent', default: false })
  out_of_hours_auto_sent: boolean;

  // ── Trigger : reopened ─────────────────────────────────────────────────────
  @Column({ name: 'reopened_at', type: 'datetime', nullable: true })
  reopened_at: Date | null;

  @Column({ name: 'reopened_auto_sent', default: false })
  reopened_auto_sent: boolean;

  // ── Trigger : queue_wait ───────────────────────────────────────────────────
  @Column({ name: 'queue_wait_auto_step', default: 0 })
  queue_wait_auto_step: number;

  @Column({ name: 'last_queue_wait_auto_sent_at', type: 'datetime', nullable: true })
  last_queue_wait_auto_sent_at: Date | null;

  // ── Trigger : on_assign ────────────────────────────────────────────────────
  @Column({ name: 'on_assign_auto_sent', default: false })
  on_assign_auto_sent: boolean;

  // ── Trigger : inactivity ───────────────────────────────────────────────────
  @Column({ name: 'inactivity_auto_step', default: 0 })
  inactivity_auto_step: number;

  @Column({ name: 'last_inactivity_auto_sent_at', type: 'datetime', nullable: true })
  last_inactivity_auto_sent_at: Date | null;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

> **Note** : Les champs legacy `auto_message_step` et `waiting_client_reply` de `WhatsappChat` ne sont pas supprimés — ils restent présents sur l'entité pour compatibilité. Les nouvelles écritures passent par `ChatContext`.

#### Critères d'acceptation

- [ ] Index unique sur `(chat_uuid, context_id)` — garantit 1 ChatContext par client × contexte
- [ ] FK vers `whatsapp_chats.id` avec `ON DELETE CASCADE`
- [ ] FK vers `contexts.id`
- [ ] `read_only` par défaut `false`
- [ ] Tous les compteurs de triggers présents

---

### CTX-A4 — Module `ContextModule`

**Type** : Backend — Module NestJS  
**Dépendances** : CTX-A1, CTX-A2, CTX-A3  
**Effort estimé** : S (1h)

#### Description

Créer le module NestJS qui encapsule les 3 nouvelles entités et les services associés.

#### Fichier à créer

`src/context/context.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Context, ContextBinding, ChatContext]),
  ],
  providers: [
    ContextResolverService,
    ContextService,
  ],
  exports: [
    ContextResolverService,
    ContextService,
    TypeOrmModule,   // expose les repos aux modules qui importent ContextModule
  ],
})
export class ContextModule {}
```

#### Critères d'acceptation

- [ ] Le module compile sans erreur
- [ ] `ContextResolverService` et `ContextService` sont exportés
- [ ] `DispatcherModule`, `WhapiModule`, `WhatsappMessageModule` pourront importer `ContextModule` sans circular dep

---

### CTX-A5 — Migration BDD `20260415_create_context_tables`

**Type** : Backend — Migration TypeORM  
**Dépendances** : CTX-A1, CTX-A2, CTX-A3  
**Effort estimé** : M (4h)

#### Description

Migration SQL qui :
1. Crée les 3 tables (`contexts`, `context_bindings`, `chat_contexts`)
2. Insère le contexte `pool` par défaut
3. Lie les canaux non-dédiés au contexte pool
4. Backfill les `chat_contexts` depuis les `WhatsappChat` existants (zéro perte de données)
5. Ajoute `context_id` sur `whatsapp_messages` (nullable, backfillé vers pool)

#### Fichier à créer

`src/database/migrations/20260415_create_context_tables.ts`

#### Points critiques de la migration

```sql
-- Étape 1 : Créer les tables (voir plan)
-- Étape 2 : Insérer contexte pool
INSERT INTO contexts (id, code, label, config)
VALUES (UUID(), 'pool', 'Pool global', '{"priority": 0, "auto_assign": true}');

-- Étape 3 : Lier canaux non-dédiés au pool
INSERT INTO context_bindings (id, context_id, entity_type, entity_id)
SELECT UUID(),
       (SELECT id FROM contexts WHERE code = 'pool'),
       'channel',
       ch.channel_id
FROM whapi_channels ch
WHERE ch.poste_id IS NULL;

-- Étape 4 : Migrer chats existants → ChatContext pool
-- Reprend les compteurs actuels de whatsapp_chat — aucune perte
INSERT INTO chat_contexts (
  id, chat_uuid, context_id, poste_id, read_only,
  last_client_message_at, last_poste_message_at,
  no_response_auto_step, last_no_response_auto_sent_at,
  out_of_hours_auto_sent,
  reopened_at, reopened_auto_sent,
  queue_wait_auto_step, last_queue_wait_auto_sent_at,
  on_assign_auto_sent,
  inactivity_auto_step, last_inactivity_auto_sent_at
)
SELECT
  UUID(), c.id,
  (SELECT id FROM contexts WHERE code = 'pool'),
  c.poste_id, 0,           -- read_only forcé à 0 à la migration
  c.last_client_message_at, NULL,
  0, NULL,                 -- no_response repart à zéro
  0, NULL, 0,              -- triggers hors-heures, réouverture
  0, NULL,
  0, 0, NULL
FROM whatsapp_chat c
WHERE c.deletedAt IS NULL;

-- Étape 5 : context_id sur whatsapp_messages (nullable)
ALTER TABLE whatsapp_messages
  ADD COLUMN context_id CHAR(36) NULL,
  ADD INDEX IDX_message_context (context_id),
  ADD CONSTRAINT FK_msg_context
    FOREIGN KEY (context_id) REFERENCES contexts(id) ON DELETE SET NULL;

UPDATE whatsapp_messages
SET context_id = (SELECT id FROM contexts WHERE code = 'pool')
WHERE context_id IS NULL;
```

#### Rollback (`down`)

```sql
ALTER TABLE whatsapp_messages
  DROP FOREIGN KEY FK_msg_context,
  DROP COLUMN context_id;
DROP TABLE IF EXISTS chat_contexts;
DROP TABLE IF EXISTS context_bindings;
DROP TABLE IF EXISTS contexts;
```

#### Critères d'acceptation

- [ ] La migration `up` tourne sur la base de staging sans erreur
- [ ] Après migration : tous les `WhatsappChat` existants ont un `ChatContext` pool correspondant
- [ ] Après migration : les `whatsapp_messages` ont `context_id` rempli avec le pool
- [ ] Le rollback `down` remet la base dans son état initial
- [ ] `read_only` forcé à `0` sur tous les `ChatContext` créés (locks en cours abandonnés — comportement acceptable)
- [ ] Les canaux dédiés (avec `poste_id IS NOT NULL`) n'ont PAS de binding automatique (créés manuellement via admin)

---

## EPIC B — Services métier

---

### CTX-B1 — `ContextResolverService`

**Type** : Backend — Service NestJS  
**Dépendances** : CTX-A4  
**Effort estimé** : M (4h)

#### Description

Service qui résout le `Context` applicable pour un message entrant.
**Appelé à chaque message** — doit être extrêmement performant.

#### Fichier à créer

`src/context/context-resolver.service.ts`

#### Logique de résolution (priorité stricte)

```
canal (channel_id)  → ContextBinding(entity_type='channel', entity_id=channelId)
         ↓ si aucun
poste (poste_id)    → ContextBinding(entity_type='poste',   entity_id=posteId)
         ↓ si aucun
provider            → ContextBinding(entity_type='provider', entity_id=provider)
         ↓ si aucun
fallback pool       → Context WHERE code = 'pool'
```

#### Interface publique

```typescript
interface IContextResolverService {
  resolveForChannel(
    channelId: string,
    options?: { provider?: string; posteId?: string },
  ): Promise<Context>;
}
```

#### Implémentation complète

```typescript
@Injectable()
export class ContextResolverService {
  private readonly logger = new Logger(ContextResolverService.name);

  constructor(
    @InjectRepository(ContextBinding)
    private readonly bindingRepo: Repository<ContextBinding>,
    @InjectRepository(Context)
    private readonly contextRepo: Repository<Context>,
  ) {}

  async resolveForChannel(
    channelId: string,
    options?: { provider?: string; posteId?: string },
  ): Promise<Context> {
    // 1. Binding par canal (priorité maximale)
    const byChannel = await this.findActiveBinding('channel', channelId);
    if (byChannel?.context) {
      this.log('channel', channelId, byChannel.context.id);
      return byChannel.context;
    }

    // 2. Binding par poste
    if (options?.posteId) {
      const byPoste = await this.findActiveBinding('poste', options.posteId);
      if (byPoste?.context) {
        this.log('poste', options.posteId, byPoste.context.id);
        return byPoste.context;
      }
    }

    // 3. Binding par provider
    if (options?.provider) {
      const byProvider = await this.findActiveBinding('provider', options.provider);
      if (byProvider?.context) {
        this.log('provider', options.provider, byProvider.context.id);
        return byProvider.context;
      }
    }

    // 4. Fallback pool
    const pool = await this.contextRepo.findOneOrFail({ where: { code: 'pool' } });
    this.log('fallback-pool', channelId, pool.id);
    return pool;
  }

  private async findActiveBinding(
    type: BindingEntityType,
    entityId: string,
  ): Promise<ContextBinding | null> {
    return this.bindingRepo.findOne({
      where: { entity_type: type, entity_id: entityId, is_active: true },
      relations: ['context'],
    });
  }

  private log(source: string, entityId: string, contextId: string): void {
    this.logger.debug(`Context resolved [${source}] ${entityId} → ${contextId}`);
  }
}
```

#### Critères d'acceptation

- [ ] Spec unitaire avec mocks couvrant les 4 cas (channel / poste / provider / pool)
- [ ] Si aucun binding actif → retourne le contexte pool (jamais `null` ni exception)
- [ ] Les logs `debug` permettent de tracer le routing en production
- [ ] Si le contexte `pool` n'existe pas en BDD → lance une exception claire

---

### CTX-B2 — `ContextService.findOrCreateChatContext()`

**Type** : Backend — Service NestJS  
**Dépendances** : CTX-A3, CTX-A4  
**Effort estimé** : M (3h)

#### Description

Service qui **récupère ou crée** le `ChatContext` pour une paire `(chatUuid, contextId)`.
C'est le cœur de l'isolation : chaque combinaison client × contexte a son propre état.

#### Fichier à créer

`src/context/context.service.ts`

#### Méthodes requises

```typescript
@Injectable()
export class ContextService {

  /**
   * Récupère ou crée le ChatContext pour (chatUuid, contextId).
   * Thread-safe : utilise un INSERT IGNORE ou ON DUPLICATE KEY.
   *
   * Si création : compteurs à zéro, read_only=false.
   * Si existant : retourne l'état actuel sans modification.
   */
  async findOrCreateChatContext(
    chatUuid: string,
    contextId: string,
    defaultPosteId?: string | null,
  ): Promise<ChatContext>;

  /**
   * Charge un ChatContext par son UUID.
   */
  async findChatContextById(id: string): Promise<ChatContext | null>;

  /**
   * Charge un ChatContext par (chatUuid, contextId).
   * Retourne null si n'existe pas encore.
   */
  async findChatContext(
    chatUuid: string,
    contextId: string,
  ): Promise<ChatContext | null>;

  /**
   * Liste les ChatContext d'un poste pour la vue frontend.
   * Remplace chatService.findByPosteId() — retourne les contextes actifs.
   */
  async findChatContextsByPoste(
    posteId: string,
    cursor?: { updatedAt: string; id: string },
    limit?: number,
  ): Promise<{ contexts: ChatContext[]; hasMore: boolean }>;
}
```

#### Implémentation de `findOrCreateChatContext`

```typescript
async findOrCreateChatContext(
  chatUuid: string,
  contextId: string,
  defaultPosteId?: string | null,
): Promise<ChatContext> {
  // Tenter de trouver d'abord
  const existing = await this.repo.findOne({
    where: { chat_uuid: chatUuid, context_id: contextId },
  });
  if (existing) return existing;

  // Créer si absent (peut y avoir race condition — géré par unique index)
  try {
    const created = this.repo.create({
      chat_uuid: chatUuid,
      context_id: contextId,
      poste_id: defaultPosteId ?? null,
      read_only: false,
    });
    return await this.repo.save(created);
  } catch (err: unknown) {
    // Duplicate key → quelqu'un l'a créé en concurrence — re-fetch
    if (isDuplicateKeyError(err)) {
      return this.repo.findOneOrFail({
        where: { chat_uuid: chatUuid, context_id: contextId },
      });
    }
    throw err;
  }
}
```

#### Critères d'acceptation

- [ ] Race condition gérée (duplicate key → re-fetch)
- [ ] `findOrCreateChatContext` retourne TOUJOURS un `ChatContext` valide (jamais null)
- [ ] Spec unitaire couvrant : création, récupération existant, race condition simulée
- [ ] `findChatContextsByPoste` supporte la pagination par cursor pour le frontend

---

### CTX-B3 — `ContextService.updateChatContext()`

**Type** : Backend — Méthode dans `ContextService`  
**Dépendances** : CTX-B2  
**Effort estimé** : M (3h)

#### Description

Méthode de mise à jour scopée qui remplace tous les `chatService.update(chat_id, ...)`.
Elle inclut des **réinitialisations automatiques** des cycles en fonction du contexte de mise à jour.

#### Logique métier des réinitialisations

```typescript
async updateChatContext(id: string, data: Partial<ChatContext>): Promise<void> {

  // Agent répond → cycle no_response repart à zéro
  if ('last_poste_message_at' in data && data.last_poste_message_at) {
    data.no_response_auto_step = 0;
    data.last_no_response_auto_sent_at = null;
  }

  // Conversation assignée → cycle queue_wait repart à zéro
  if (data.poste_id !== undefined && data.poste_id !== null) {
    data.queue_wait_auto_step = 0;
    data.last_queue_wait_auto_sent_at = null;
    data.on_assign_auto_sent = false;
  }

  // Toute activité → cycle inactivity repart à zéro
  if ('last_activity_at' in data && data.last_activity_at) {
    data.inactivity_auto_step = 0;
    data.last_inactivity_auto_sent_at = null;
  }

  await this.repo.update({ id }, data);
}
```

#### Critères d'acceptation

- [ ] Spec unitaire avec 3 cas de réinitialisation automatique
- [ ] `read_only: true/false` fonctionne comme un lock (isolation par `chatContext.id`)
- [ ] Jamais de mise à jour par `chat_id` — toujours par `chatContext.id`
- [ ] Les appels concurrents sur le même `id` sont safe (pas de race condition TypeORM)

---

### CTX-B4 — `ContextService.findChatContextsByPoste()` — Pagination cursor

**Type** : Backend — Méthode dans `ContextService`  
**Dépendances** : CTX-B2  
**Effort estimé** : M (3h)

#### Description

Remplace `chatService.findByPosteId()` dans le gateway frontend.
Doit supporter la pagination par cursor pour les postes avec beaucoup de conversations.

#### Signature

```typescript
async findChatContextsByPoste(
  posteId: string,
  options?: {
    cursor?: { updatedAt: string; id: string };
    limit?: number;
    contextId?: string;   // filtre optionnel par contexte
    statuses?: WhatsappChatStatus[];
  },
): Promise<{
  contexts: Array<ChatContext & { chat: WhatsappChat }>;
  hasMore: boolean;
  nextCursor?: { updatedAt: string; id: string };
}>
```

#### Critères d'acceptation

- [ ] Retourne les conversations d'un poste triées par `updatedAt DESC`
- [ ] Pagination cursor : `nextCursor` = `{ updatedAt, id }` du dernier item
- [ ] Filtre optionnel `contextId` (pour n'afficher qu'un contexte dans la sidebar)
- [ ] `hasMore: true` si `limit` items retournés

---

## EPIC C — Intégration Pipeline Entrant

---

### CTX-C1 — `DispatcherService` — Résolution du contexte

**Type** : Backend — Modification `dispatcher.service.ts`  
**Dépendances** : CTX-A4, CTX-B1, CTX-B2  
**Effort estimé** : L (6h)

#### Description

Modifier `DispatcherService.assignConversation()` pour :
1. Résoudre le `Context` via `ContextResolverService`
2. Créer/récupérer le `ChatContext`
3. Retourner `{ chat: WhatsappChat, chatContext: ChatContext }` au lieu de juste `WhatsappChat`

#### Signature actuelle → nouvelle

```typescript
// Avant
async assignConversation(
  clientPhone: string, clientName: string, traceId?: string,
  tenantId?: string, channelId?: string,
): Promise<WhatsappChat | null>

// Après
async assignConversation(
  clientPhone: string, clientName: string, traceId?: string,
  tenantId?: string, channelId?: string,
): Promise<{ chat: WhatsappChat; chatContext: ChatContext } | null>
```

#### Changements dans `AssignConversationUseCase`

```typescript
// Dans execute() :
const context = await this.contextResolver.resolveForChannel(
  channelId ?? '',
  { provider: options?.provider, posteId: existingChat?.poste_id ?? undefined },
);

const chatContext = await this.contextService.findOrCreateChatContext(
  chat.id,
  context.id,
  chat.poste_id,  // poste initial = poste du WhatsappChat
);

return { chat, chatContext };
```

#### Vérification des postes dédiés

```typescript
// Si le contexte a un poste dédié (via ContextBinding type 'poste')
// → assigner directement ce poste dans ChatContext, pas via la queue pool
const posteBinding = context.bindings?.find(b => b.entity_type === 'poste' && b.is_active);
if (posteBinding) {
  chatContext.poste_id = posteBinding.entity_id;
  await contextService.updateChatContext(chatContext.id, { poste_id: posteBinding.entity_id });
} else {
  // Flux normal : queue pool
}
```

#### Critères d'acceptation

- [ ] Le retour de `assignConversation` est rétrocompatible (les appelants qui ignoraient `chatContext` continuent de fonctionner)
- [ ] Si le canal est dédié (binding contexte avec poste) → la conversation est directement assignée au poste dédié, pas en queue
- [ ] Spec mis à jour dans `dispatcher.service.spec.ts`
- [ ] `ContextModule` ajouté dans les imports de `DispatcherModule`

---

### CTX-C2 — `InboundMessageService` — Propagation du `chatContext`

**Type** : Backend — Modification `webhooks/inbound-message.service.ts`  
**Dépendances** : CTX-C1  
**Effort estimé** : M (4h)

#### Description

Modifier `InboundMessageService` pour :
1. Récupérer le `chatContext` retourné par `dispatcherService.assignConversation()`
2. Le passer à `InboundStateUpdateService`
3. L'inclure dans l'événement `INBOUND_MESSAGE_PROCESSED_EVENT`

#### Modification du pipeline

```typescript
// Étape 3 — dispatcher (avant)
const chat = await this.dispatcherService.assignConversation(...);

// Étape 3 — dispatcher (après)
const result = await this.dispatcherService.assignConversation(...);
const chat = result?.chat ?? null;
const chatContext = result?.chatContext ?? null;

// Étape 6 — state update (avant)
await this.stateUpdateService.apply(conversation, savedMessage);

// Étape 6 — state update (après)
await this.stateUpdateService.apply(conversation, savedMessage, chatContext);
```

#### Modification de l'événement `InboundMessageProcessedEvent`

```typescript
// Ajouter le champ contextId
export interface InboundMessageProcessedEvent {
  chatId: string;
  messageId: string;
  channelId?: string;
  contextId?: string;      // ← nouveau
  chatContextId?: string;  // ← nouveau
  // ...
}
```

#### Critères d'acceptation

- [ ] `chatContext` est non-null quand le dispatcher a résolu un contexte
- [ ] L'événement `INBOUND_MESSAGE_PROCESSED_EVENT` inclut `contextId` et `chatContextId`
- [ ] Si `dispatcherService` retourne null (canal inconnu) → `chatContext` null, pas d'erreur

---

### CTX-C3 — `InboundStateUpdateService` — Migration vers `ChatContext`

**Type** : Backend — Modification `ingress/domain/inbound-state-update.service.ts`  
**Dépendances** : CTX-B3, CTX-C2  
**Effort estimé** : M (3h)

#### Description

Remplacer `chatService.update(chat_id, ...)` par `contextService.updateChatContext(chatContext.id, ...)`.
C'est la correction du **Bug 2 — Corruption des compteurs**.

#### Avant (code actuel)

```typescript
await this.chatService.update(conversation.chat_id, {
  read_only: false,
  last_client_message_at: clientMessageAt,
});
```

#### Après

```typescript
if (chatContext) {
  // Mise à jour scopée → isolation par contexte ✅
  await this.contextService.updateChatContext(chatContext.id, {
    read_only: false,
    last_client_message_at: clientMessageAt,
    last_activity_at: clientMessageAt,
    waiting_client_reply: false,
  });
  // Mise à jour en mémoire pour cohérence immédiate
  chatContext.read_only = false;
  chatContext.last_client_message_at = clientMessageAt;
} else {
  // Fallback legacy (chatContext pas encore résolu — compatibilité)
  await this.chatService.update(conversation.chat_id, {
    read_only: false,
    last_client_message_at: clientMessageAt,
  });
}
```

#### Critères d'acceptation

- [ ] Si `chatContext` disponible → `contextService.updateChatContext()` — jamais `chatService.update(chat_id)`
- [ ] Si `chatContext` null (cas legacy transitoire) → fallback `chatService.update(chat_id)` temporaire
- [ ] Spec unitaire avec les deux cas (avec / sans chatContext)
- [ ] La mutation en mémoire de `chatContext` reste cohérente avec le pipeline aval

---

### CTX-C4 — `AssignConversationUseCase` — Gestion poste dédié par contexte

**Type** : Backend — Modification `dispatcher/application/assign-conversation.use-case.ts`  
**Dépendances** : CTX-B1, CTX-B2  
**Effort estimé** : M (4h)

#### Description

Modifier la logique d'assignation pour respecter le poste dédié défini par le contexte,
en remplacement du mécanisme actuel basé sur `WhapiChannel.poste_id`.

#### Règle de priorité

```
1. Contexte canal → poste dédié (ContextBinding type='poste' lié au Context du canal)
2. Poste en cours (si la conversation existe déjà et a un poste dans le ChatContext)
3. Queue pool globale
```

#### Critères d'acceptation

- [ ] Un message entrant sur un canal dédié va toujours au poste défini dans le ContextBinding
- [ ] Un message entrant sur un canal pool va à la queue globale
- [ ] Si le poste dédié est hors-ligne → queue pool (comportement actuel conservé)
- [ ] `resolvePosteForChannel()` dans `DispatcherService` est renommé ou adapté pour utiliser `ContextResolverService`

---

## EPIC D — Intégration FlowBot

---

### CTX-D1 — `FlowBot.scopeContextId` — Portée par contexte

**Type** : Backend — Modification entité FlowBot + contrôleur  
**Dépendances** : CTX-A1  
**Effort estimé** : M (3h)

#### Description

Ajouter un champ `scopeContextId` sur l'entité `FlowBot` pour restreindre un flux à un contexte donné.
Complémentaire à `scopeChannelType` / `scopeProviderRef` déjà existants.

#### Modification de l'entité

```typescript
// Dans src/flowbot/entities/flow-bot.entity.ts — ajouter :
@Column({ name: 'scope_context_id', type: 'char', length: 36, nullable: true })
scopeContextId: string | null;
// null = flux global (tous contextes)
// valeur = flux actif uniquement pour ce contexte
```

#### Modification du `FlowTriggerService.findMatchingFlow()`

```typescript
// Ajouter après le check scopeChannelType / scopeProviderRef :
if (flow.scopeContextId && flow.scopeContextId !== event.contextId) continue;
```

#### Modification de `BotInboundMessageEvent`

```typescript
// Dans src/flowbot/events/bot-inbound-message.event.ts — ajouter :
contextId?: string;
chatContextId?: string;
```

#### Admin — `FlowBuilderView` meta

Ajouter un champ "Contexte" dans le formulaire de métadonnées du flux (select des contextes disponibles via `GET /flowbot/contexts`).

#### Critères d'acceptation

- [ ] Un flux avec `scopeContextId = 'ctx-recrutement'` ne se déclenche QUE sur les messages dans ce contexte
- [ ] Un flux avec `scopeContextId = null` se déclenche sur tous les contextes (comportement actuel)
- [ ] Le `BotInboundMessageEvent` transporte `contextId`
- [ ] L'admin permet de sélectionner un contexte lors de la création/édition d'un flux
- [ ] Spec unitaire : `findMatchingFlow` avec et sans filtre contexte

---

### CTX-D2 — `InboundMessageService` → FlowBot avec contexte

**Type** : Backend — Modification `webhooks/inbound-message.service.ts`  
**Dépendances** : CTX-C2, CTX-D1  
**Effort estimé** : S (2h)

#### Description

Enrichir l'événement `BOT_INBOUND_EVENT` avec le `contextId` et `chatContextId` issus du pipeline entrant.

#### Modification

```typescript
// Dans InboundMessageService — construction de BotInboundMessageEvent :
const botEvent: BotInboundMessageEvent = {
  // ... champs existants ...
  contextId: chatContext?.context_id,         // ← nouveau
  chatContextId: chatContext?.id,             // ← nouveau
};
this.eventEmitter.emit(BOT_INBOUND_EVENT, botEvent);
```

#### Critères d'acceptation

- [ ] `BOT_INBOUND_EVENT` transporte `contextId` quand disponible
- [ ] `FlowTriggerService` peut filtrer par `contextId` (ticket CTX-D1)

---

### CTX-D3 — Nouveau endpoint admin `GET /flowbot/contexts`

**Type** : Backend — Endpoint dans `flowbot.controller.ts`  
**Dépendances** : CTX-A4  
**Effort estimé** : S (1h)

#### Description

Exposer la liste des contextes disponibles depuis le contrôleur FlowBot,
pour alimenter le select "Contexte" dans l'admin FlowBuilder.

```typescript
@Get('contexts')
async listContexts() {
  return this.contextService.findAllActive();
}
```

#### Critères d'acceptation

- [ ] Endpoint protégé par `AdminGuard`
- [ ] Retourne `{ id, code, label }[]` des contextes actifs
- [ ] Admin `flowbot.api.ts` expose `getContexts()`

---

## EPIC E — Interface Admin

---

### CTX-E1 — Vue admin "Contextes"

**Type** : Frontend Admin — Nouveau composant  
**Dépendances** : CTX-A5 (migration déployée), CTX-E3  
**Effort estimé** : L (6h)

#### Description

Créer la vue d'administration des contextes : liste, création, activation/désactivation.

#### Fichier à créer

`admin/src/app/modules/contexts/components/ContextsView.tsx`

#### Fonctionnalités

| Action | Description |
|--------|-------------|
| Lister les contextes | Tableau avec code, label, is_active, config.priority |
| Créer un contexte | Formulaire : code (identifiant slug), label, priority, bot_enabled, bot_flow_id |
| Activer / désactiver | Toggle is_active |
| Modifier le label | Inline edit ou drawer |
| Supprimer | Confirmé — uniquement si aucun ChatContext actif n'est lié |

#### Critères d'acceptation

- [ ] Le code est unique (erreur visible si doublon)
- [ ] Impossible de supprimer le contexte `pool` (protégé côté backend)
- [ ] La modification d'un contexte invalide le cache Redis `ContextResolverService`
- [ ] La vue est accessible depuis le menu nav Admin (groupe "Infrastructure")

---

### CTX-E2 — Vue admin "Bindings (Liaisons)"

**Type** : Frontend Admin — Nouveau composant  
**Dépendances** : CTX-E1, CTX-E3  
**Effort estimé** : L (6h)

#### Description

Vue de gestion des `ContextBinding` : qui (canal/poste/provider) est rattaché à quel contexte.

#### Fichier à créer

`admin/src/app/modules/contexts/components/ContextBindingsView.tsx`

#### Fonctionnalités

| Action | Description |
|--------|-------------|
| Lister tous les bindings | Tableau : type (canal/poste/provider) → entity_id → contexte |
| Créer un binding | Select type, select entity (liste des canaux/postes), select contexte |
| Activer / désactiver | Toggle sans suppression |
| Supprimer un binding | Retour au fallback (pool) |

#### Règle d'affichage

- Les canaux avec `poste_id IS NOT NULL` (dédiés) sont mis en évidence
- Un binding désactivé apparaît en grisé

#### Critères d'acceptation

- [ ] La création d'un binding canal dédié → contexte déclenche l'invalidation du cache
- [ ] Le binding unique `(context_id, entity_type, entity_id)` est respecté (erreur visible si doublon)
- [ ] La vue affiche clairement "Pas de binding → fallback pool"

---

### CTX-E3 — API admin CRUD Contextes et Bindings

**Type** : Backend — Endpoints dans un nouveau `ContextController`  
**Dépendances** : CTX-A4, CTX-B1  
**Effort estimé** : M (4h)

#### Description

Créer les endpoints REST CRUD pour la gestion admin des contextes et bindings.

#### Fichier à créer

`src/context/context.controller.ts`

#### Endpoints

```
GET    /contexts                → liste tous les contextes actifs
GET    /contexts/:id            → détail d'un contexte avec ses bindings
POST   /contexts                → créer un contexte
PATCH  /contexts/:id            → modifier label/config/is_active
DELETE /contexts/:id            → supprimer (si aucun ChatContext actif)

GET    /contexts/bindings       → liste tous les bindings (paginé)
POST   /contexts/bindings       → créer un binding
PATCH  /contexts/bindings/:id   → activer/désactiver
DELETE /contexts/bindings/:id   → supprimer
```

#### Critères d'acceptation

- [ ] Tous les endpoints protégés par `AdminGuard`
- [ ] `DELETE /contexts/:id` refusé si `chat_contexts` actifs liés (erreur 409)
- [ ] `DELETE /contexts/pool` refusé (code protégé)
- [ ] Après tout CREATE / PATCH / DELETE sur un binding → invalider le cache Redis

---

### CTX-E4 — Filtre contextuel dans la sidebar Conversations

**Type** : Frontend Commercial — Modification de la vue conversations  
**Dépendances** : CTX-B4, CTX-C1  
**Effort estimé** : M (4h)

#### Description

Permettre à un agent de filtrer ses conversations par contexte dans la sidebar.
Un agent qui gère à la fois le pool et le support peut basculer entre les deux vues.

#### Fonctionnalités

- Dropdown "Contexte" dans la sidebar (si plusieurs contextes disponibles pour le poste)
- Par défaut : tous les contextes (comportement actuel)
- Filtré : uniquement les `ChatContext` avec `context_id = X`

#### Critères d'acceptation

- [ ] Le filtre persiste en local storage (pas de perte au reload)
- [ ] Le badge de compteur de conversations non lues est filtré par contexte
- [ ] Si un seul contexte disponible → dropdown caché (pas de changement UX)

---

## EPIC F — Performance, Tests et Cleanup

---

### CTX-F1 — Cache Redis pour `ContextResolverService`

**Type** : Backend — Performance  
**Dépendances** : CTX-B1  
**Effort estimé** : M (4h)

#### Description

`resolveForChannel` est appelé à **chaque message entrant**. Sans cache, c'est 1-3 requêtes SQL par message.
Mettre en cache le résultat avec Redis (ou cache mémoire en développement).

#### Stratégie de cache

```
Clé   : "ctx:channel:{channelId}"
Valeur: Context (sérialisé JSON)
TTL   : 60 secondes (invalidation automatique)

Invalidation explicite sur :
  - CREATE context_binding
  - PATCH context_binding (is_active)
  - DELETE context_binding
```

#### Implémentation

```typescript
async resolveForChannel(channelId: string, ...): Promise<Context> {
  const cacheKey = `ctx:channel:${channelId}`;

  // Tenter le cache
  const cached = await this.cacheManager.get<Context>(cacheKey);
  if (cached) return cached;

  // Résoudre depuis la BDD
  const context = await this.resolveFromDb(channelId, options);

  // Mettre en cache
  await this.cacheManager.set(cacheKey, context, 60_000);

  return context;
}
```

#### Critères d'acceptation

- [ ] Avec cache chaud : `resolveForChannel` < 1 ms
- [ ] Après modification d'un binding → cache invalidé (prochain message prend le nouveau contexte)
- [ ] En développement (pas de Redis) → cache mémoire avec TTL 60s
- [ ] Les tests unitaires mockent le cache (pas de dépendance Redis en CI)

---

### CTX-F2 — Tests unitaires et d'intégration

**Type** : Backend — Tests  
**Dépendances** : CTX-B1, CTX-B2, CTX-B3, CTX-C1, CTX-C3  
**Effort estimé** : L (6h)

#### Specs à créer

| Spec | Ce qui est testé |
|------|-----------------|
| `context-resolver.service.spec.ts` | 4 cas de résolution (channel/poste/provider/pool) + cache |
| `context.service.spec.ts` | findOrCreate, updateChatContext (avec réinitialisations), race condition |
| `assign-conversation.use-case.spec.ts` | Mise à jour du spec existant — retourne chatContext |
| `inbound-state-update.service.spec.ts` | Mise à jour → appel contextService.updateChatContext |

#### Critères d'acceptation

- [ ] `npx jest` passe à 100% avec ces nouveaux specs
- [ ] Coverage `context/` > 85%
- [ ] Aucun test existant cassé

---

### CTX-F3 — Nettoyage des champs legacy (phase 2 — future)

**Type** : Backend — Migration future  
**Dépendances** : Déploiement stable de CTX-A5 à CTX-C3 pendant 1 mois minimum  
**Effort estimé** : M (3h)  
**⚠️ NE PAS IMPLÉMENTER en même temps que le reste**

#### Description

Une fois que toutes les écritures passent par `ChatContext` (vérifié en production pendant 30 jours),
supprimer les champs legacy de `WhatsappChat` qui ne sont plus mis à jour.

#### Champs concernés sur `WhatsappChat`

```
read_only
waiting_client_reply
last_client_message_at (remplacé par ChatContext.last_client_message_at)
auto_message_step → supprimé (table message_auto disparue)
no_response_auto_step → supprimé
queue_wait_auto_step → supprimé
inactivity_auto_step → supprimé
[autres compteurs trigger]
```

#### Critères d'acceptation (future)

- [ ] Aucun service n'écrit dans ces colonnes (vérifier avec grep avant migration)
- [ ] Migration avec DROP COLUMN et FK cleanup
- [ ] Tests repassés

---

## Ordre d'implémentation recommandé

```
Sprint 1 (1 semaine) — Fondations
  CTX-A1 → CTX-A2 → CTX-A3 → CTX-A4 (entités + module)
  CTX-A5 (migration BDD — déployée sur staging uniquement)

Sprint 2 (1 semaine) — Services
  CTX-B1 (ContextResolverService + spec)
  CTX-B2 (ContextService.findOrCreate + spec)
  CTX-B3 (ContextService.updateChatContext + spec)
  CTX-B4 (ContextService.findChatContextsByPoste)

Sprint 3 (1 semaine) — Intégration pipeline
  CTX-C4 (AssignConversationUseCase)
  CTX-C1 (DispatcherService — retourne chatContext)
  CTX-C2 (InboundMessageService — propagation chatContext)
  CTX-C3 (InboundStateUpdateService — correction du bug critique)
  ← Déployer sur staging et vérifier absence de corruption

Sprint 4 (1 semaine) — FlowBot + Admin CRUD
  CTX-D1 (FlowBot.scopeContextId)
  CTX-D2 (InboundMessageService → FlowBot avec contextId)
  CTX-D3 (GET /flowbot/contexts)
  CTX-E3 (API admin CRUD contextes/bindings)

Sprint 5 (1 semaine) — Interface admin + Performance
  CTX-E1 (Vue admin Contextes)
  CTX-E2 (Vue admin Bindings)
  CTX-F1 (Cache Redis)
  CTX-F2 (Tests complets)

Sprint 6 (future) — Cleanup
  CTX-E4 (Filtre contextuel sidebar commercial)
  CTX-F3 (Nettoyage legacy)
```

---

## Points de vigilance critiques

| # | Point | Action |
|---|-------|--------|
| 1 | **Hot-path performance** | `resolveForChannel` appelé à chaque message → CTX-F1 obligatoire avant production |
| 2 | **Race condition création** | `findOrCreateChatContext` doit gérer le duplicate key — voir CTX-B2 |
| 3 | **Mutex `getChatMutex(chatId)`** | Conserver dans `InboundMessageService` sur `chat_id` — protège la création de `WhatsappChat`. Le lock interne passe sur `chatContext.id` |
| 4 | **Canaux dédiés existants** | La migration ne crée PAS automatiquement leurs ContextBindings. L'admin doit le faire manuellement via CTX-E2 après déploiement |
| 5 | **Soft-delete cascade** | `FK chat_contexts.chat_uuid ON DELETE CASCADE` — si WhatsappChat est soft-deleted, les ChatContext restent. Ajouter logique applicative si nécessaire |
| 6 | **Log systématique** | Toujours logger `[source] entityId → contextId` dans `resolveForChannel`. Essentiel pour debug en production |
| 7 | **Backward compat fallback** | Dans `InboundStateUpdateService` (CTX-C3) : si `chatContext = null` → fallback `chatService.update(chat_id)`. Supprimer ce fallback en CTX-F3 seulement |
| 8 | **Test déploiement staging** | Déployer CTX-A5 sur staging, injecter 100 messages tests, vérifier `SELECT COUNT(*) FROM chat_contexts` = nombre de chats actifs |

---

## Définition of Done (DoD) par ticket

Un ticket est **terminé** quand :
1. ✅ Code implémenté, `tsc --noEmit` passe
2. ✅ Spec unitaire écrit et `npx jest` passe
3. ✅ PR créée sur `feature/context-driven-platform`
4. ✅ Revue de code approuvée
5. ✅ Déployé sur staging, testé manuellement
6. ✅ Aucune régression sur les specs existants

---

## Résumé des fichiers à créer / modifier

### Nouveaux fichiers

```
src/context/entities/context.entity.ts                       CTX-A1
src/context/entities/context-binding.entity.ts               CTX-A2
src/context/entities/chat-context.entity.ts                  CTX-A3
src/context/context.module.ts                                CTX-A4
src/database/migrations/20260415_create_context_tables.ts    CTX-A5
src/context/context-resolver.service.ts                      CTX-B1
src/context/context.service.ts                               CTX-B2/B3/B4
src/context/context.controller.ts                            CTX-E3
src/context/__tests__/context-resolver.service.spec.ts       CTX-F2
src/context/__tests__/context.service.spec.ts                CTX-F2
admin/src/app/modules/contexts/components/ContextsView.tsx   CTX-E1
admin/src/app/modules/contexts/components/ContextBindingsView.tsx CTX-E2
admin/src/app/lib/api/context.api.ts                         CTX-E3
```

### Fichiers existants à modifier

```
src/flowbot/entities/flow-bot.entity.ts                      CTX-D1 (+scopeContextId)
src/flowbot/events/bot-inbound-message.event.ts              CTX-D1/D2 (+contextId)
src/flowbot/services/flow-trigger.service.ts                 CTX-D1 (filtre contextId)
src/flowbot/flowbot.controller.ts                            CTX-D3 (GET /contexts)
src/flowbot/flowbot.module.ts                                CTX-D1 (import ContextModule)
src/dispatcher/dispatcher.service.ts                         CTX-C1 (retour chatContext)
src/dispatcher/application/assign-conversation.use-case.ts   CTX-C4 (résolution contexte)
src/dispatcher/dispatcher.module.ts                          CTX-C1 (import ContextModule)
src/webhooks/inbound-message.service.ts                      CTX-C2 (propagation chatContext)
src/ingress/domain/inbound-state-update.service.ts           CTX-C3 (updateChatContext)
src/ingress/events/inbound-message-processed.event.ts        CTX-C2 (+contextId)
admin/src/app/data/admin-data.ts                             CTX-E1 (nav "Contextes")
admin/src/app/lib/definitions.ts                             CTX-E3 (types Context, ChatContext)
admin/src/app/dashboard/commercial/page.tsx                  CTX-E1 (nouveau case)
admin/src/app/modules/flowbot/components/FlowBuilderView.tsx CTX-D1 (select contexte)
```
