# Plan d'implémentation — Meta Ad Referral (CTWA 72h)

**Date :** 2026-06-01 (révisé après relecture)
**Objectif :** Capturer les données `referral` Meta (Click-to-WhatsApp) dans une entité dédiée, adapter la fenêtre de conversation à 72h pour ces clients, et exposer des KPIs par campagne publicitaire.

---

## Contexte

Quand un client clique sur une publicité Meta (Facebook/Instagram) qui pointe vers WhatsApp, Meta inclut dans le **premier** webhook entrant un objet `referral` :

```json
{
  "referral": {
    "source_url": "https://fb.com/ads/...",
    "source_type": "ad",
    "source_id": "123456789",
    "headline": "Titre de la pub",
    "body": "Texte de la pub",
    "media_type": "image",
    "image_url": "https://...",
    "ctwa_clid": "ARAkLgQ..."
  }
}
```

**Règles Meta non respectées aujourd'hui :**
- Client direct (sans pub) → fenêtre **24h** (implémentée à 23h ✅)
- Client CTWA (via pub) → fenêtre **72h** (absente ❌)

**Ce qui existe déjà :** Le champ `campaignLinkId` sur `whatsapp_chat` est notre système interne de tracking de liens (URLs courtes générées par nos soins), sans aucun rapport avec les pubs Meta.

---

## Architecture cible

```
MetaMessage (webhook Meta)
    └─ referral ─────────────────────────────────────┐
                                                     ▼
                                         meta_ad_referral (table)
                                              id (PK)
                                              chat_id UNIQUE → whatsapp_chat.id
                                              source_url, source_type, source_id
                                              headline, body, media_type
                                              image_url, ctwa_clid, created_at
                                                     │
                                         whatsapp_chat
                                              is_ctwa = true ──► fenêtre 72h
```

**Décision de relation :** `meta_ad_referral.chat_id` → `whatsapp_chat.id` est la seule FK (UNIQUE). Le champ inverse `whatsapp_chat.meta_ad_referral_id` est supprimé du plan original — il créait deux FK croisées inutiles. Le flag `is_ctwa` sur `whatsapp_chat` suffit pour toutes les requêtes rapides (fenêtres, filtres SQL, index).

---

## Étapes d'implémentation

### Étape 1 — Nouvelle entité `MetaAdReferral`

**Fichier à créer :** `message_whatsapp/src/meta-ad-referral/entities/meta-ad-referral.entity.ts`

```typescript
@Entity({ name: 'meta_ad_referral', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MetaAdReferral {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'chat_id', type: 'char', length: 36, unique: true })
  chatId: string;

  @OneToOne(() => WhatsappChat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_id' })
  chat: WhatsappChat;

  @Column({ name: 'source_url',  type: 'varchar', length: 2048, nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'source_type', type: 'varchar', length: 50 })
  sourceType: string; // "ad" | "post" | "product"

  @Column({ name: 'source_id',   type: 'varchar', length: 255 })
  sourceId: string; // ID de la pub Meta

  @Column({ name: 'headline',    type: 'varchar', length: 512, nullable: true })
  headline: string | null;

  @Column({ name: 'body',        type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'media_type',  type: 'varchar', length: 50, nullable: true })
  mediaType: string | null;

  @Column({ name: 'image_url',   type: 'varchar', length: 2048, nullable: true })
  imageUrl: string | null;

  @Column({ name: 'ctwa_clid',   type: 'varchar', length: 512, nullable: true })
  ctwaClid: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

---

### Étape 2 — Module `MetaAdReferralModule`

**Fichier à créer :** `message_whatsapp/src/meta-ad-referral/meta-ad-referral.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MetaAdReferral])],
  providers: [MetaAdReferralService],
  exports: [MetaAdReferralService],
})
export class MetaAdReferralModule {}
```

**Service `MetaAdReferralService` :** expose une seule méthode :
```typescript
async createIfAbsent(chatId: string, referral: UnifiedReferral): Promise<void>
// Vérifie si un referral existe déjà pour ce chat (idempotent), sinon insère.
```

**Important :** Ce module doit être importé dans **`WhapiModule`** (pas seulement dans `AppModule`), car c'est `InboundMessageService` (déclaré dans `WhapiModule`) qui l'appelle.

```typescript
// whapi.module.ts — ajouter dans imports:
MetaAdReferralModule,
```

---

### Étape 3 — Mise à jour de l'entité `WhatsappChat`

**Fichier :** `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Ajouter un seul champ :

```typescript
@Column({ name: 'is_ctwa', type: 'boolean', default: false })
isCtwa: boolean;
```

Pas de FK inverse — la relation est portée uniquement par `meta_ad_referral.chat_id`.

---

### Étape 4 — Mise à jour de l'interface Meta webhook

**Fichier :** `message_whatsapp/src/whapi/interface/whatsapp-whebhook.interface.ts`

```typescript
export interface MetaReferral {
  source_url?:  string;
  source_type:  string;  // "ad" | "post" | "product"
  source_id:    string;
  headline?:    string;
  body?:        string;
  media_type?:  string;
  image_url?:   string;
  ctwa_clid?:   string;
}

// Dans MetaMessageBase — ajouter le champ optionnel :
referral?: MetaReferral;
```

---

### Étape 5 — Mise à jour du `UnifiedMessage`

**Fichier :** `message_whatsapp/src/webhooks/normalization/unified-message.ts`

Définir l'interface exportée `UnifiedReferral` (réutilisée dans le service) :

```typescript
export interface UnifiedReferral {
  sourceUrl?:  string;
  sourceType:  string;
  sourceId:    string;
  headline?:   string;
  body?:       string;
  mediaType?:  string;
  imageUrl?:   string;
  ctwaClid?:   string;
}
```

Puis dans l'interface `UnifiedMessage` :

```typescript
metaReferral?: UnifiedReferral | null;
```

Le service `MetaAdReferralService` typera son paramètre `referral: UnifiedReferral` (import depuis `unified-message.ts`), ce qui évite de dupliquer le type inline dans `createIfAbsent`.

---

### Étape 6 — Mise à jour du `MetaAdapter`

**Fichier :** `message_whatsapp/src/webhooks/adapters/meta.adapter.ts`

`mapMessage()` retourne actuellement un objet littéral directement (`return { provider, ... }`). Il faut d'abord assigner l'objet à une variable, puis enrichir conditionnellement, puis retourner :

```typescript
// Remplacer le return { ... } final par :
const unified: UnifiedMessage = {
  provider: context.provider,
  // ... tous les champs existants ...
  raw,
};

if (message.referral) {
  unified.metaReferral = {
    sourceUrl:  message.referral.source_url,
    sourceType: message.referral.source_type,
    sourceId:   message.referral.source_id,
    headline:   message.referral.headline,
    body:       message.referral.body,
    mediaType:  message.referral.media_type,
    imageUrl:   message.referral.image_url,
    ctwaClid:   message.referral.ctwa_clid,
  };
}

return unified;
```

---

### Étape 7 — Persistance dans `InboundMessageService`

**Fichier :** `message_whatsapp/src/webhooks/inbound-message.service.ts`

Dans ce service, la variable du `UnifiedMessage` se nomme `message` et le chat résolu se nomme `conversation`. Adapter le snippet en conséquence :

```typescript
if (message.provider === 'meta' && message.metaReferral && !conversation.isCtwa) {
  await this.metaAdReferralService.createIfAbsent(conversation.id, message.metaReferral);
  await this.chatService.update(conversation.chat_id, { isCtwa: true });
  conversation.isCtwa = true; // cohérence locale pour la suite
}
```

**Idempotence transactionnelle — `createIfAbsent` :**

Deux webhooks concurrent peuvent passer le `!conversation.isCtwa` avant que le flag soit mis à jour en base. `createIfAbsent` doit être robuste contre cela. Stratégie recommandée : upsert MySQL ou catch sur violation de contrainte unique :

```typescript
import { randomUUID } from 'crypto';

async createIfAbsent(chatId: string, referral: UnifiedReferral): Promise<void> {
  try {
    await this.referralRepo.insert({
      id: randomUUID(), // générer l'UUID explicitement ; TypeORM ne l'auto-génère pas avec insert()
      chatId,
      sourceUrl:  referral.sourceUrl  ?? null,
      sourceType: referral.sourceType,
      sourceId:   referral.sourceId,
      headline:   referral.headline   ?? null,
      body:       referral.body       ?? null,
      mediaType:  referral.mediaType  ?? null,
      imageUrl:   referral.imageUrl   ?? null,
      ctwaClid:   referral.ctwaClid   ?? null,
    });
  } catch (err: any) {
    // ER_DUP_ENTRY — referral déjà existant pour ce chat, ignorer
    if (err?.code !== 'ER_DUP_ENTRY') throw err;
  }
}
```

La contrainte `UNIQUE KEY UQ_meta_ad_referral_chat_id (chat_id)` garantit qu'un seul referral sera inséré même sous contention — le second thread reçoit `ER_DUP_ENTRY` et continue silencieusement.

---

### Étape 8 — Ajustement des fenêtres de conversation

Il y a **trois endroits** à modifier (le plan initial en oubliait un) :

#### 8a. Gateway WebSocket
**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` (~ligne 910)

```typescript
// Avant :
const WINDOW_MS = 23 * 60 * 60 * 1000;

// Après :
const WINDOW_MS = chat.isCtwa
  ? 72 * 60 * 60 * 1000
  : 23 * 60 * 60 * 1000;
```

#### 8b. Auto-message Orchestrator
**Fichier :** `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts` (~lignes 281-292)

Même remplacement : valeur fixe `23h` → conditionnelle selon `chat.isCtwa`.

#### 8c. AutoMessageMasterJob — Triggers A et E
**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

- **Ligne 121** (Trigger A — sans réponse)
- **Ligne 245** (Trigger E — attente en queue)

Ces deux triggers filtrent en SQL avec `.andWhere('c.last_client_message_at >= :window23h', { window23h })`.

Remplacer par une condition OR qui gère les deux types :

```typescript
const window23h = new Date(Date.now() - 23 * 60 * 60_000);
const window72h = new Date(Date.now() - 72 * 60 * 60_000);

// Dans le QueryBuilder, remplacer la ligne window23h par :
// (0/1 explicites car is_ctwa est TINYINT(1), évite toute ambiguïté MySQL avec false/true)
qb.andWhere(
  `((c.is_ctwa = 0 AND c.last_client_message_at >= :window23h)
    OR (c.is_ctwa = 1 AND c.last_client_message_at >= :window72h))`,
  { window23h, window72h },
);
```

---

### Étape 9 — Migration BDD

**Fichier à créer :** `message_whatsapp/src/database/migrations/AddMetaAdReferral1780272000001.ts`

La migration suit le style du repo (`columnExists` + `addCol` helpers, `hasTable` pour la table nouvelle) :

```typescript
export class AddMetaAdReferral1780272000001 implements MigrationInterface {
  name = 'AddMetaAdReferral1780272000001';

  private async columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const [row] = await qr.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    ) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async addCol(qr: QueryRunner, table: string, col: string, def: string): Promise<void> {
    if (!(await this.columnExists(qr, table, col))) {
      await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
    }
  }

  private async indexExists(qr: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await qr.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // ── 1. Nouvelle table meta_ad_referral ─────────────────────────────────────
    if (!(await qr.hasTable('meta_ad_referral'))) {
      await qr.query(`
        CREATE TABLE \`meta_ad_referral\` (
          \`id\`          CHAR(36)      NOT NULL,
          \`chat_id\`     CHAR(36)      NOT NULL,
          \`source_url\`  VARCHAR(2048) NULL,
          \`source_type\` VARCHAR(50)   NOT NULL,
          \`source_id\`   VARCHAR(255)  NOT NULL,
          \`headline\`    VARCHAR(512)  NULL,
          \`body\`        TEXT          NULL,
          \`media_type\`  VARCHAR(50)   NULL,
          \`image_url\`   VARCHAR(2048) NULL,
          \`ctwa_clid\`   VARCHAR(512)  NULL,
          \`created_at\`  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_meta_ad_referral_chat_id\` (\`chat_id\`),
          INDEX \`IDX_meta_ad_referral_source_id\` (\`source_id\`),
          CONSTRAINT \`FK_meta_ad_referral_chat\`
            FOREIGN KEY (\`chat_id\`) REFERENCES \`whatsapp_chat\` (\`id\`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
      `);
    }

    // ── 2. Colonne is_ctwa sur whatsapp_chat ───────────────────────────────────
    await this.addCol(qr, 'whatsapp_chat', 'is_ctwa', 'TINYINT(1) NOT NULL DEFAULT 0');

    // ── 3. Index sur is_ctwa pour les filtres SQL des jobs ─────────────────────
    if (!(await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_is_ctwa'))) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` ADD INDEX \`IDX_chat_is_ctwa\` (\`is_ctwa\`)`);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.indexExists(qr, 'whatsapp_chat', 'IDX_chat_is_ctwa')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP INDEX \`IDX_chat_is_ctwa\``);
    }
    if (await this.columnExists(qr, 'whatsapp_chat', 'is_ctwa')) {
      await qr.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`is_ctwa\``);
    }
    if (await qr.hasTable('meta_ad_referral')) {
      await qr.query(`DROP TABLE \`meta_ad_referral\``);
    }
  }
}
```

---

### Étape 10 — KPIs par campagne Meta

**Endpoint :** `GET /api/metriques/campagnes-meta?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`

(Nommage `dateFrom`/`dateTo` aligné sur le reste du module métriques.)

**Normalisation des bornes dans le service :**
```typescript
const dateFrom     = new Date(`${dto.dateFrom}T00:00:00.000Z`);
const dateToExclusive = new Date(`${dto.dateTo}T00:00:00.000Z`);
dateToExclusive.setDate(dateToExclusive.getDate() + 1); // borne exclusive = jour suivant

// Paramètres passés à la requête : :dateFrom et :dateToExclusive
```
`BETWEEN` est évité : `dateTo=2026-06-01` sans heure serait interprété comme `2026-06-01 00:00:00` et exclurait toute la journée. La borne exclusive `< dateToExclusive` couvre correctement jusqu'à `2026-06-01 23:59:59.999`.

**Fichier :** `message_whatsapp/src/metriques/meta-ad-kpi.service.ts` (service dédié)

**Enregistrement dans `MetriquesModule` :**
```typescript
// metriques.module.ts — ajouter :
providers: [MetriquesService, AnalyticsSnapshotService, MetaAdKpiService],
```
Si `MetaAdKpiService` injecte `Repository<MetaAdReferral>`, ajouter aussi `MetaAdReferral` dans `TypeOrmModule.forFeature([...])` du module. Alternative : exécuter la requête via le `DataSource` ou `EntityManager` déjà présent dans `MetriquesService`, auquel cas aucun ajout à `forFeature` n'est nécessaire.

KPIs retournés par `source_id` :

| KPI | Description |
|-----|-------------|
| `source_id` | ID de la pub Meta |
| `headline` | Titre de la pub |
| `total_conversations` | Chats initiés depuis cette pub |
| `conversations_closed` | Chats au statut `fermé` |
| `conversion_rate` | `closed / total * 100` |
| `avg_messages_per_chat` | Moyenne messages échangés |
| `avg_first_response_s` | Temps moyen de 1ère réponse agent (secondes) |
| `first_seen` | Date du premier referral capturé |
| `last_seen` | Date du dernier referral capturé |

Le `avg_first_response_s` suit la même logique que `metriques.service.ts:261` (TIMESTAMPDIFF entre le premier message IN et le premier message OUT du même chat) — réutiliser ce pattern, pas inventer un nouveau champ.

**Requête principale :**

```sql
-- Note : whatsapp_message.chat_id = WhatsappChat.chat_id (identifiant métier WhatsApp),
--        pas WhatsappChat.id (UUID PK). Les jointures sur msg_count et first_response
--        doivent utiliser c.chat_id, pas c.id.
-- Note : la colonne soft-delete de whatsapp_message est `deletedAt` (camelCase TypeORM),
--        pas `deleted_at`. Idem pour whatsapp_chat.
SELECT
  r.source_id,
  MAX(r.headline)                                       AS headline,
  COUNT(DISTINCT c.id)                                  AS total_conversations,
  SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)  AS conversations_closed,
  ROUND(
    SUM(CASE WHEN c.status = 'fermé' THEN 1 ELSE 0 END)
    / COUNT(DISTINCT c.id) * 100, 1
  )                                                     AS conversion_rate,
  ROUND(AVG(msg_count.cnt), 1)                          AS avg_messages_per_chat,
  ROUND(AVG(first_response.delta_s), 0)                 AS avg_first_response_s,
  MIN(r.created_at)                                     AS first_seen,
  MAX(r.created_at)                                     AS last_seen
FROM meta_ad_referral r
INNER JOIN whatsapp_chat c ON c.id = r.chat_id AND c.deletedAt IS NULL
LEFT JOIN (
  -- tenant_id inclus : WhatsappChat est unique sur (tenant_id, chat_id), pas sur chat_id seul.
  -- <=> (null-safe equal) car certains anciens chats peuvent avoir tenant_id = NULL.
  SELECT tenant_id, chat_id, COUNT(*) AS cnt
  FROM whatsapp_message WHERE deletedAt IS NULL
  GROUP BY tenant_id, chat_id
) msg_count ON msg_count.chat_id = c.chat_id
          AND msg_count.tenant_id <=> c.tenant_id
LEFT JOIN (
  -- Version précise : on cherche le premier message IN du chat, puis le premier OUT
  -- strictement postérieur à ce premier IN — évite les faux calculs si des messages OUT
  -- ont été envoyés avant le premier message entrant (ex: message de bienvenue auto).
  SELECT
    first_in.tenant_id,
    first_in.chat_id,
    TIMESTAMPDIFF(SECOND, first_in.first_in_ts, MIN(msg_out.timestamp)) AS delta_s
  FROM (
    SELECT tenant_id, chat_id, MIN(timestamp) AS first_in_ts
    FROM whatsapp_message
    WHERE direction = 'IN' AND deletedAt IS NULL
    GROUP BY tenant_id, chat_id
  ) first_in
  INNER JOIN whatsapp_message msg_out
    ON msg_out.chat_id        = first_in.chat_id
   AND msg_out.tenant_id     <=> first_in.tenant_id
   AND msg_out.direction      = 'OUT'
   AND msg_out.timestamp      > first_in.first_in_ts
   AND msg_out.deletedAt     IS NULL
   AND msg_out.commercial_id IS NOT NULL  -- messages humains uniquement (exclut auto-messages)
  GROUP BY first_in.tenant_id, first_in.chat_id, first_in.first_in_ts
) first_response ON first_response.chat_id = c.chat_id
               AND first_response.tenant_id <=> c.tenant_id
-- dateFrom : début de journée tel quel (YYYY-MM-DD 00:00:00)
-- dateTo   : borne exclusive = dateFrom + N jours → évite d'exclure la journée entière
--            si dateTo est passé sans heure (ex: 2026-06-01 serait tronqué à 00:00:00 par BETWEEN)
WHERE r.created_at >= :dateFrom
  AND r.created_at <  :dateToExclusive
GROUP BY r.source_id
ORDER BY total_conversations DESC
```

---

## Ordre d'exécution recommandé

```
1 → Étape 4  : interface MetaReferral              — aucune dépendance
2 → Étape 5  : UnifiedMessage + metaReferral       — dépend de l'interface
3 → Étape 6  : MetaAdapter extraction              — dépend de UnifiedMessage
4 → Étape 1  : entité MetaAdReferral               — aucune dépendance externe
5 → Étape 2  : MetaAdReferralModule + Service      — dépend de l'entité
6 → Étape 3  : WhatsappChat + is_ctwa              — aucune dépendance
7 → Étape 9  : Migration BDD                       — dépend des entités finalisées
8 → Étape 7  : InboundMessageService               — dépend de tout ce qui précède
9 → Étape 8  : Fenêtres (gateway + orchestrateur + master job) — dépend de is_ctwa en BDD
10 → Étape 10 : KPIs metriques                     — dépend de la table en place
```

---

## Fichiers à créer / modifier

| Action | Fichier |
|--------|---------|
| CRÉER | `src/meta-ad-referral/entities/meta-ad-referral.entity.ts` |
| CRÉER | `src/meta-ad-referral/meta-ad-referral.module.ts` |
| CRÉER | `src/meta-ad-referral/meta-ad-referral.service.ts` |
| CRÉER | `src/database/migrations/AddMetaAdReferral1780272000001.ts` |
| MODIFIER | `src/whapi/interface/whatsapp-whebhook.interface.ts` |
| MODIFIER | `src/webhooks/normalization/unified-message.ts` |
| MODIFIER | `src/webhooks/adapters/meta.adapter.ts` |
| MODIFIER | `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` |
| MODIFIER | `src/webhooks/inbound-message.service.ts` |
| MODIFIER | `src/whapi/whapi.module.ts` (import MetaAdReferralModule) |
| MODIFIER | `src/whatsapp_message/whatsapp_message.gateway.ts` |
| MODIFIER | `src/message-auto/auto-message-orchestrator.service.ts` |
| MODIFIER | `src/jorbs/auto-message-master.job.ts` (lignes 121 et 245) |
| MODIFIER | `src/metriques/metriques.module.ts` (providers + forFeature si injection repo) |
| MODIFIER | `src/metriques/metriques.service.ts` ou nouveau service KPI |
| MODIFIER | `src/metriques/metriques.controller.ts` (nouvelle route) |

---

## Tests à écrire

| Fichier | Ce qui doit être testé |
|---------|------------------------|
| `meta.adapter.spec.ts` | `mapMessage()` avec `referral` présent → `unified.metaReferral` correctement mappé ; sans `referral` → `unified.metaReferral` absent/undefined |
| `meta-ad-referral.service.spec.ts` | `createIfAbsent` insère au premier appel ; second appel sur même `chatId` ne lève pas d'erreur (catch `ER_DUP_ENTRY`) |
| `inbound-message.service.spec.ts` | Message `provider=meta` avec referral + `conversation.isCtwa=false` → appelle `createIfAbsent` + `chatService.update` ; provider non-meta → pas d'appel |
| `whatsapp_message.gateway.spec.ts` | Chat `isCtwa=true` → fenêtre 72h appliquée ; `isCtwa=false` → fenêtre 23h |
| `auto-message-orchestrator.service.spec.ts` | Chat `isCtwa=true` à 48h → fenêtre 72h non expirée, message envoyé ; chat direct à 25h → fenêtre 23h expirée, message bloqué |
| `auto-message-master.job.spec.ts` | Trigger A et E : chat CTWA à 48h passe le filtre (dans 72h) ; chat direct à 25h échoue (hors 23h) |

---

## Points de vigilance

- **Idempotence :** `createIfAbsent` ne crée le referral qu'une fois par chat. Le flag `is_ctwa` évite tout doublon si un second message arrive avec un referral.
- **Fournisseur :** Bloquer la logique referral aux canaux `provider = 'meta'` uniquement — ne pas exécuter pour Whapi, Messenger, Telegram, Instagram.
- **Données historiques :** Chats existants avant migration : `is_ctwa = false`, fenêtre 23h inchangée. Pas de backfill (le referral du 1er message n'a pas été capturé).
- **`ctwa_clid` :** Ce champ est le Click ID Meta — il permet à Meta de faire le lien entre le clic pub et la conversation dans Ads Manager. Le stocker fidèlement.
- **Trigger A et E dans le master job :** Ce sont les seuls deux triggers du job qui filtrent explicitement sur `23h`. Les autres triggers (C, D, F, G, H, I) utilisent une fenêtre glissante différente (`windowStart`) ou pas de filtre temporel sur `last_client_message_at` — les laisser tels quels.
