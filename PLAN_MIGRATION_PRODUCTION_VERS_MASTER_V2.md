# Plan de migration : Production → Master V2
> Révision 8 — 2026-06-17  
> Statut : **Candidat exécutable** — en attente dry-run staging validé

---

## 0. Principe fondamental

> **Master V2 ne doit avoir aucune régression par rapport à la branche production.**  
> Toutes les fonctionnalités actives en production doivent être présentes et opérationnelles dans  
> master V2, en plus des nouvelles fonctionnalités V2.

---

## 1. Architecture de la migration (approche retenue)

```
PRODUCTION (DB live)
       │
       │  Export manuel phpMyAdmin → fichier .sql
       ▼
DEV V2 (DB développement)
       │
       │  Import manuel phpMyAdmin
       │  npm run migration:run   ← applique TOUTES les migrations V2 en attente
       ▼
DEV V2 fonctionne avec données production réelles
       │
       │  ... développement, tests, validation ...
       ▼
GO-LIVE
       │  Changer MYSQL_HOST dans .env V2 → pointe vers DB production
       │  npm run migration:run   ← même commande, même résultat
       ▼
PRODUCTION tourne sous V2 ✅
```

**Principe clé :** la commande `npm run migration:run` doit produire un résultat identique  
qu'elle soit exécutée sur la DB dev importée ou directement sur la DB production.  
Cela signifie que **toutes les transformations de données doivent vivre dans des migrations TypeORM**,  
pas dans des scripts externes.

**Deux axes de travail parallèles :**

| Axe | Quoi | Exécuté par |
|---|---|---|
| **A — Migrations DB** | Fichiers TypeORM qui convergent production → V2 | `npm run migration:run` |
| **B — Portage code** | Modules, composants, vues production absents de master | Branche `feature/convergence-production` |

---

## 2. Workflow phpMyAdmin

### Étape 1 — Export de la DB production

Dans phpMyAdmin (serveur production) :

```
Base de données production → Exporter
  Format      : SQL
  Options SQL :
    ✅ Ajouter DROP TABLE IF EXISTS
    ✅ Ajouter IF NOT EXISTS à CREATE TABLE
    ✅ Données complètes (INSERT INTO)
    ✅ Inclure les triggers
    ✅ Utiliser une transaction (BEGIN/COMMIT)
  Compression : gzip (si la DB est volumineuse)
```

Télécharger le fichier `production_YYYYMMDD.sql.gz`.

### Étape 2 — Création de la DB dev V2

Dans phpMyAdmin (serveur dev) :

```
Nouvelle base de données : db_v2_dev
  Interclassement : utf8mb4_unicode_ci   ← important, même collation que production
```

### Étape 3 — Import dans la DB dev V2

```
db_v2_dev → Importer → Choisir le fichier production_YYYYMMDD.sql.gz
  Encodage : utf8
  Lancer l'import
```

> **📏 Mesurer la durée réelle d'export/import lors du dry-run staging** (chronométrer les deux opérations).  
> Si l'export dépasse 5 minutes ou le fichier dépasse 500 MB, phpMyAdmin peut provoquer un timeout.  
> Dans ce cas, utiliser `mysqldump` / `mysql` en ligne de commande plutôt que phpMyAdmin pour le go-live.  
> La procédure reste identique — seul le vecteur d'import change.

> **⚠️ Si erreur de collation :** ajouter en tête du fichier SQL (ou dans phpMyAdmin avant import) :
> ```sql
> SET NAMES utf8mb4;
> SET character_set_client = utf8mb4;
> ```
> Si des erreurs de clé étrangère apparaissent, cocher "Désactiver les vérifications FK" dans phpMyAdmin.

### Étape 4 — Exécuter les migrations V2

```bash
cd message_whatsapp
npm run migration:run
```

Cette commande applique, dans l'ordre chronologique, **toutes les migrations V2 en attente**,  
y compris les migrations de convergence décrites dans ce plan.

### Étape 5 — Vérifier l'intégrité

```bash
mysql -u$USER -p$PASS db_v2_dev < docs/migration/verify_integrity.sql
```

---

## 3. Divergences de schéma à couvrir par les migrations

### 3.1 Colonnes production absentes de master V2 (ajout additif)

Ces colonnes sont ajoutées via la migration `ConvergenceProductionToMasterV2_1748995200099.ts`.

| Table | Colonne(s) à ajouter | Type |
|---|---|---|
| `dispatch_settings` | `read_cooldown_seconds`, `idle_warning_seconds`, `max_read_messages_per_minute`, `idle_disconnect_enabled`, `idle_disconnect_minutes`, `read_only_max_messages` | INT/TINYINT |
| `whapi_channels` | `phone_number` | VARCHAR(32) |
| `whatsapp_chat` | `campaign_link_id` | CHAR(36) |
| `whatsapp_message` | `is_first_reply`, `read_by_commercial_id`, `read_by_commercial_at` | TINYINT/CHAR/DATETIME |
| `whatsapp_message` | `hour_of_day`, `day_of_week_n` | TINYINT VIRTUAL (index perf) |
| `whatsapp_commercial` | `messages_read_count`, `messages_handled_count`, `last_activity_at`, `allow_outside_hours` | INT/DATETIME/TINYINT |

### 3.2 Tables production absentes de master V2 (création)

| Table | Créée par |
|---|---|
| `messaging_connection_log` | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `campaign_link` | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `campaign_link_click` | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `media_asset` | `ConvergenceProductionToMasterV2_1748995200099.ts` |

### 3.3 Conflits de schéma (transformations de données)

| Conflit | Migration dédiée |
|---|---|
| `whatsapp_template` : schéma V1 prod → schéma V2 master | `FixWhatsappTemplateSchema1746620000001.ts` (déjà dans master) + `TransformTemplateData_1748995200100.ts` (à créer) |
| `queue_mode` prod → `dispatch_mode` master (UPPERCASE) | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `read_only_after_messages` → `max_messages_before_readonly` | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `poste_message_count_since_last_client` → `outbound_message_count` | `ConvergenceProductionToMasterV2_1748995200099.ts` |
| `messages_predefinis` → FlowBot + `_legacy_*` | `20260414_remove_auto_message_legacy.ts` (déjà dans master) |
| `business_hours_config` : données production à conserver | **Aucune transformation** — table identique, données importées via phpMyAdmin |

### 3.4 Nouvelles tables créées par les migrations production (absentes de master V2)

Ces tables sont créées par des migrations présentes dans la branche `production` mais **absentes de master V2**. Elles seront créées par `npm run migration:run` lors du go-live, à condition que les migrations correspondantes soient portées dans master via la branche `feature/convergence-production`.

| Table | Migration créatrice | Rôle |
|---|---|---|
| `commercial_conversation_access` | `ConversationRestrictionAccess1748649600001` | Suivi quotidien des accès/réponses par commercial (système de restriction) |
| `meta_ad_referral` | `AddMetaAdReferral1780272000001` | Données referral Meta (Click-to-WhatsApp) — fenêtre 72h |
| `chat_session` | `AddChatSessionEntity1780531200000` | Source de vérité session active par conversation (CTWA/normal) |
| `quiz_category`, `quiz_question`, `quiz_answer`, `quiz_session`, `quiz_session_question`, `quiz_attempt`, `quiz_attempt_answer` | `AddQuizSystem1749686400000` | Système QCM quotidien obligatoire pour les commerciaux |

**Colonnes ajoutées par migrations production (non encore listées en 3.1) :**

| Table | Colonnes ajoutées | Migration |
|---|---|---|
| `whapi_channels` | `read_only_after_messages` (INT) | `ReadOnlyConfig1746144000008` |
| `whatsapp_chat` | `poste_message_count_since_last_client` (INT) | `ReadOnlyConfig1746144000008` |
| `whatsapp_chat` | `active_session_id` (CHAR(36)) | `AddChatSessionEntity1780531200000` |
| `whatsapp_chat` | `is_ctwa` (TINYINT) | `AddMetaAdReferral1780272000001` |
| `whatsapp_chat` | `window_expires_at` (TIMESTAMP) | `AddWindowExpiresAtToChat1781522555000` |
| `whatsapp_chat` | `last_window_reminder_sent_at` (DATETIME) | `AddWindowReminderSection1780531200001` |
| `whatsapp_chat` | `profile_pic_fetched_at` (TIMESTAMP) | `AddProfilePicFetchedAt1750041600001` |
| `whatsapp_message` | `read_by_commercial_id` (CHAR(36)), `read_by_commercial_at` (DATETIME) | `AddMessageReadTracking1748822400001` |
| `whatsapp_message` | `is_first_reply` (TINYINT) | `AddConversationTurnTracking1748908800001` |
| `whatsapp_commercial` | `messages_read_count`, `messages_handled_count`, `last_activity_at` | `AddMessageReadTracking1748822400001` |
| `dispatch_settings` | `max_read_messages_per_minute`, `idle_disconnect_enabled`, `idle_disconnect_minutes` | `AddIdleDisconnectSettings1748822400002` |
| `dispatch_settings` | `read_cooldown_seconds`, `idle_warning_seconds` | `AddCooldownAndWarningSettings1748908800002` |
| `whatsapp_poste` | `media_panel_enabled` (TINYINT), `media_panel_types` (VARCHAR) | `AddMediaPanelToPoste1749513600001` |
| `whatsapp_media` | `local_url`, `local_path`, `provider_url_expired` (TINYINT), `downloaded_at` | `AddLocalMediaStorage1749427200001` |
| `messages_predefinis` | `media_asset_id` (FK → media_asset) | `AddMediaToAutoMessage1749168000001` |
| `messages_predefinis` | trigger_type ENUM étendu avec `'window_reminder'` | `AddWindowReminderSection1780531200001` |
| `cron_config` | `window_reminder_normal_start_min`, `window_reminder_normal_end_min`, `window_reminder_ctwa_start_min`, `window_reminder_ctwa_end_min`, `window_reminder_min_replies`, `ttl_days_ctwa` | `AddWindowReminderCronFields1780531200002` |
| `whatsapp_message` | `message_id`, `external_id`, `provider_message_id` → VARCHAR(512) | `FixInstagramMessageIdLength1780876800001` |
| `whatsapp_chat` | `chat_pic`, `chat_pic_full` → VARCHAR(255) (était 100) | `AddProfilePicFetchedAt1750041600001` |

**Indexes de performance ajoutés :**

| Index | Table | Migration |
|---|---|---|
| `IDX_msg_read_by_commercial` | `whatsapp_message` | `AddMessageReadTracking1748822400001` |
| `IDX_msg_first_reply` | `whatsapp_message` | `AddConversationTurnTracking1748908800001` |
| `IDX_msg_trafic_covering`, `IDX_msg_trafic_hour`, `IDX_msg_trafic_dow` | `whatsapp_message` | `AddTrafficGroupingIndexes1748995200001` |
| `IDX_msg_ctwa_kpi` | `whatsapp_message` | `AddMetaAdKpiIndex1780272000002` |

> **Note importante :** certaines de ces colonnes se chevauchent avec celles listées en section 3.1 (colonnes portées par `ConvergenceProductionToMasterV2_1748995200099`). Les colonnes `read_by_commercial_id`, `read_by_commercial_at`, `is_first_reply`, `messages_read_count`, `messages_handled_count`, `last_activity_at`, `read_cooldown_seconds`, `idle_warning_seconds`, `idle_disconnect_*`, `max_read_messages_per_minute` sont maintenant portées directement par leurs migrations dédiées — la migration de convergence doit vérifier avec `hasColumn()` pour ne pas dupliquer. Ceci est déjà le cas dans le code de `ConvergenceProductionToMasterV2_1748995200099` (toutes les colonnes sont conditionnelles).

### 3.5 Nouvelle migration de backfill — `BackfillWindowExpiresAt1781654400001`

Cette migration corrige les conversations `actif` et `en_attente` créées **avant** la mise en place du système de sessions glissantes (`Phase9SlidingWindow...`) et dont `window_expires_at` est `NULL`. Sans ce backfill, le frontend interprète `null` comme "fenêtre expirée" et bloque le champ de saisie du commercial — même pour des conversations actives (Bug #1 du RAPPORT_BUG_FENETRE_ET_ATTENTE.md).

**Logique :** `window_expires_at = last_client_message_at + INTERVAL 24 HOUR`

- Si le résultat est dans le **futur** → fenêtre encore active, champ de saisie débloqué.
- Si le résultat est dans le **passé** → fenêtre effectivement expirée, blocage légitime.

**Périmètre :** uniquement les conversations `status IN ('actif', 'en_attente')`, `window_expires_at IS NULL`, `last_client_message_at IS NOT NULL`, `deletedAt IS NULL`.

**Exécution :** automatique via `npm run migration:run` — aucune intervention manuelle requise.

**Migration présente dans :** `message_whatsapp/src/database/migrations/BackfillWindowExpiresAt1781654400001.ts`

---

## 4. Migrations TypeORM à créer

### 4.1 `ConvergenceProductionToMasterV2_1748995200099.ts`

Cette migration est **idempotente** : elle peut s'exécuter sur la DB dev importée ET sur la DB production au go-live, avec le même résultat.

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvergenceProductionToMasterV2_1748995200099 implements MigrationInterface {
  name = 'ConvergenceProductionToMasterV2_1748995200099';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── dispatch_settings ─────────────────────────────────────────────────────
    const ds = 'dispatch_settings';

    for (const [col, def] of [
      ['read_cooldown_seconds',         'INT NOT NULL DEFAULT 120'],
      ['idle_warning_seconds',          'INT NOT NULL DEFAULT 10'],
      ['max_read_messages_per_minute',  'INT NOT NULL DEFAULT 1'],
      ['idle_disconnect_enabled',       'TINYINT(1) NOT NULL DEFAULT 1'],
      ['idle_disconnect_minutes',       'INT NOT NULL DEFAULT 15'],
      ['read_only_max_messages',        'INT NOT NULL DEFAULT 1'],
    ] as [string, string][]) {
      if (!(await queryRunner.hasColumn(ds, col)))
        await queryRunner.query(`ALTER TABLE \`${ds}\` ADD COLUMN \`${col}\` ${def}`);
    }

    // Résolution conflit queue_mode (prod) → dispatch_mode (master)
    // dispatch_mode est déjà présent dans master via DispatchModeColumn1747267200001
    // Si queue_mode existe encore (import prod), copier sa valeur en UPPERCASE dans dispatch_mode
    const hasQueueMode = await queryRunner.hasColumn(ds, 'queue_mode');
    if (hasQueueMode) {
      await queryRunner.query(
        `UPDATE \`${ds}\` SET \`dispatch_mode\` = UPPER(\`queue_mode\`) WHERE \`queue_mode\` IS NOT NULL`,
      );
      // Ne pas supprimer queue_mode ici pour éviter de casser du code production encore actif
      // La suppression se fera après validation complète du go-live
    }

    // ── whapi_channels ────────────────────────────────────────────────────────
    if (!(await queryRunner.hasColumn('whapi_channels', 'phone_number')))
      await queryRunner.query(
        `ALTER TABLE \`whapi_channels\` ADD COLUMN \`phone_number\` VARCHAR(32) NULL DEFAULT NULL`,
      );

    // Résolution read_only_after_messages (prod) → max_messages_before_readonly (master)
    const hasOldReadOnly = await queryRunner.hasColumn('whapi_channels', 'read_only_after_messages');
    const hasNewReadOnly = await queryRunner.hasColumn('whapi_channels', 'max_messages_before_readonly');
    if (hasOldReadOnly && hasNewReadOnly) {
      await queryRunner.query(`
        UPDATE \`whapi_channels\`
        SET \`max_messages_before_readonly\` = \`read_only_after_messages\`
        WHERE \`read_only_after_messages\` IS NOT NULL
          AND \`max_messages_before_readonly\` IS NULL
      `);
    }

    // ── whatsapp_chat ─────────────────────────────────────────────────────────
    if (!(await queryRunner.hasColumn('whatsapp_chat', 'campaign_link_id')))
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`campaign_link_id\` CHAR(36) NULL DEFAULT NULL`,
      );

    // Résolution poste_message_count_since_last_client → outbound_message_count
    const hasOldCount = await queryRunner.hasColumn('whatsapp_chat', 'poste_message_count_since_last_client');
    const hasNewCount = await queryRunner.hasColumn('whatsapp_chat', 'outbound_message_count');
    if (hasOldCount && hasNewCount) {
      await queryRunner.query(`
        UPDATE \`whatsapp_chat\`
        SET \`outbound_message_count\` = \`poste_message_count_since_last_client\`
        WHERE \`poste_message_count_since_last_client\` > 0
          AND \`outbound_message_count\` = 0
      `);
    }

    // ── whatsapp_message ──────────────────────────────────────────────────────
    const msg = 'whatsapp_message';

    for (const [col, def] of [
      ['is_first_reply',        'TINYINT(1) NULL DEFAULT NULL'],
      ['read_by_commercial_id', 'CHAR(36) NULL DEFAULT NULL'],
      ['read_by_commercial_at', 'DATETIME NULL DEFAULT NULL'],
    ] as [string, string][]) {
      if (!(await queryRunner.hasColumn(msg, col)))
        await queryRunner.query(`ALTER TABLE \`${msg}\` ADD COLUMN \`${col}\` ${def}`);
    }

    // Colonnes virtuelles (index de performance trafic)
    if (!(await queryRunner.hasColumn(msg, 'hour_of_day')))
      await queryRunner.query(
        `ALTER TABLE \`${msg}\` ADD COLUMN \`hour_of_day\` TINYINT UNSIGNED GENERATED ALWAYS AS (HOUR(\`createdAt\`)) VIRTUAL`,
      );

    if (!(await queryRunner.hasColumn(msg, 'day_of_week_n')))
      await queryRunner.query(
        `ALTER TABLE \`${msg}\` ADD COLUMN \`day_of_week_n\` TINYINT UNSIGNED GENERATED ALWAYS AS (WEEKDAY(\`createdAt\`)) VIRTUAL`,
      );

    // Index de performance
    const idxRows: { INDEX_NAME: string }[] = await queryRunner.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'whatsapp_message'
        AND INDEX_NAME IN (
          'IDX_msg_trafic_covering','IDX_msg_trafic_hour',
          'IDX_msg_trafic_dow','IDX_msg_first_reply','IDX_msg_read_commercial'
        )
    `);
    const existingIdx = new Set(idxRows.map(r => r.INDEX_NAME));

    if (!existingIdx.has('IDX_msg_trafic_covering'))
      await queryRunner.query(`CREATE INDEX \`IDX_msg_trafic_covering\` ON \`${msg}\` (\`createdAt\`, \`direction\`, \`deletedAt\`)`);
    if (!existingIdx.has('IDX_msg_trafic_hour'))
      await queryRunner.query(`CREATE INDEX \`IDX_msg_trafic_hour\` ON \`${msg}\` (\`hour_of_day\`, \`createdAt\`, \`deletedAt\`)`);
    if (!existingIdx.has('IDX_msg_trafic_dow'))
      await queryRunner.query(`CREATE INDEX \`IDX_msg_trafic_dow\` ON \`${msg}\` (\`day_of_week_n\`, \`createdAt\`, \`deletedAt\`)`);
    if (!existingIdx.has('IDX_msg_first_reply'))
      await queryRunner.query(`CREATE INDEX \`IDX_msg_first_reply\` ON \`${msg}\` (\`is_first_reply\`)`);
    if (!existingIdx.has('IDX_msg_read_commercial'))
      await queryRunner.query(`CREATE INDEX \`IDX_msg_read_commercial\` ON \`${msg}\` (\`read_by_commercial_id\`)`);

    // ── whatsapp_commercial ───────────────────────────────────────────────────
    const comm = 'whatsapp_commercial';

    for (const [col, def] of [
      ['messages_read_count',    'INT NOT NULL DEFAULT 0'],
      ['messages_handled_count', 'INT NOT NULL DEFAULT 0'],
      ['last_activity_at',       'DATETIME NULL DEFAULT NULL'],
      ['allow_outside_hours',    'TINYINT(1) NOT NULL DEFAULT 0'],
    ] as [string, string][]) {
      if (!(await queryRunner.hasColumn(comm, col)))
        await queryRunner.query(`ALTER TABLE \`${comm}\` ADD COLUMN \`${col}\` ${def}`);
    }

    // ── Tables absentes de master V2 ─────────────────────────────────────────
    //
    // Si ces tables existent déjà en production (importées via phpMyAdmin),
    // hasTable() retourne true et le CREATE TABLE est ignoré.
    // Dans ce cas, on vérifie que le schéma importé contient les colonnes/index
    // attendus par le code V2. Un schéma production légèrement différent
    // (colonne manquante, FK absente) provoquerait une erreur à l'exécution.

    // ── messaging_connection_log ───────────────────────────────────────────────
    if (!(await queryRunner.hasTable('messaging_connection_log'))) {
      await queryRunner.query(`
        CREATE TABLE \`messaging_connection_log\` (
          \`id\`         VARCHAR(36)                NOT NULL,
          \`user_id\`    VARCHAR(255)               NOT NULL,
          \`user_type\`  ENUM('commercial','admin') NOT NULL,
          \`login_at\`   DATETIME                   NOT NULL,
          \`logout_at\`  DATETIME                   NULL DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_conn_log_user\` (\`user_id\`, \`user_type\`, \`login_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasTable('media_asset'))) {
      await queryRunner.query(`
        CREATE TABLE \`media_asset\` (
          \`id\`            VARCHAR(36)                                  NOT NULL,
          \`name\`          VARCHAR(255)                                 NOT NULL,
          \`original_name\` VARCHAR(255)                                 NOT NULL,
          \`file_path\`     VARCHAR(500)                                 NOT NULL,
          \`public_url\`    VARCHAR(500)                                 NOT NULL,
          \`mime_type\`     VARCHAR(100)                                 NOT NULL,
          \`media_type\`    ENUM('image','video','audio','document')     NOT NULL,
          \`file_size\`     INT                                          NOT NULL,
          \`category\`      VARCHAR(100)                                 NULL,
          \`tags\`          JSON                                         NULL,
          \`color_label\`   VARCHAR(7)                                   NULL,
          \`usage_count\`   INT                                          NOT NULL DEFAULT 0,
          \`created_at\`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasTable('campaign_link'))) {
      await queryRunner.query(`
        CREATE TABLE \`campaign_link\` (
          \`id\`                 CHAR(36)     NOT NULL,
          \`name\`               VARCHAR(100) NOT NULL,
          \`channel_id\`         VARCHAR(100) NOT NULL,
          \`predefined_message\` TEXT         NOT NULL,
          \`short_code\`         VARCHAR(16)  NOT NULL,
          \`direct_url\`         TEXT         NOT NULL,
          \`tracked_url\`        TEXT         NOT NULL,
          \`click_count\`        INT          NOT NULL DEFAULT 0,
          \`conversion_count\`   INT          NOT NULL DEFAULT 0,
          \`media_asset_id\`     VARCHAR(36)  NULL,
          \`is_active\`          TINYINT(1)   NOT NULL DEFAULT 1,
          \`createdAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_campaign_link_short_code\` (\`short_code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // ── Vérification schéma des tables potentiellement importées depuis production ──
    // La table existe (importée ou créée ci-dessus) → vérifier les colonnes critiques V2.
    await this.assertColumn(queryRunner, 'messaging_connection_log', 'user_type',
      `table messaging_connection_log : colonne user_type manquante ou schéma incompatible`);
    await this.assertColumn(queryRunner, 'media_asset', 'media_type',
      `table media_asset : colonne media_type manquante`);
    await this.assertColumn(queryRunner, 'campaign_link', 'short_code',
      `table campaign_link : colonne short_code manquante`);

    // campaign_link_click : colonnes critiques + FK
    if (await queryRunner.hasTable('campaign_link_click')) {
      // Vérifier les colonnes critiques avant toute opération sur la FK
      await this.assertColumn(queryRunner, 'campaign_link_click', 'campaign_link_id',
        `table campaign_link_click : colonne campaign_link_id manquante`);
      await this.assertColumn(queryRunner, 'campaign_link_click', 'clicked_at',
        `table campaign_link_click : colonne clicked_at manquante`);

      // Vérifier les orphelins AVANT d'ajouter la FK (sinon l'ALTER TABLE échoue)
      const orphans: { cnt: string }[] = await queryRunner.query(`
        SELECT COUNT(*) AS cnt
        FROM \`campaign_link_click\` clk
        LEFT JOIN \`campaign_link\` lnk ON clk.campaign_link_id = lnk.id
        WHERE lnk.id IS NULL
      `);
      const orphanCount = parseInt(orphans[0].cnt, 10);
      if (orphanCount > 0) {
        throw new Error(
          `[ConvergenceProductionToMasterV2] ${orphanCount} ligne(s) dans campaign_link_click ` +
          `référencent un campaign_link_id inexistant.\n` +
          `Nettoyer les orphelins avant de relancer la migration :\n` +
          `DELETE clk FROM campaign_link_click clk LEFT JOIN campaign_link lnk ON clk.campaign_link_id = lnk.id WHERE lnk.id IS NULL;`,
        );
      }

      // Ajouter la FK si absente
      const fkExists: { cnt: string }[] = await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'campaign_link_click'
          AND CONSTRAINT_NAME = 'FK_click_campaign_link'
      `);
      if (parseInt(fkExists[0].cnt, 10) === 0) {
        await queryRunner.query(`
          ALTER TABLE \`campaign_link_click\`
            ADD CONSTRAINT \`FK_click_campaign_link\`
              FOREIGN KEY (\`campaign_link_id\`) REFERENCES \`campaign_link\` (\`id\`) ON DELETE CASCADE
        `);
      }
    }

    if (!(await queryRunner.hasTable('campaign_link_click'))) {
      await queryRunner.query(`
        CREATE TABLE \`campaign_link_click\` (
          \`id\`               CHAR(36)     NOT NULL,
          \`campaign_link_id\` CHAR(36)     NOT NULL,
          \`clicked_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`ip_hash\`          VARCHAR(64)  NULL,
          \`user_agent\`       TEXT         NULL,
          \`device_type\`      VARCHAR(16)  NULL,
          \`converted\`        TINYINT(1)   NOT NULL DEFAULT 0,
          \`converted_at\`     TIMESTAMP    NULL,
          \`chat_id\`          VARCHAR(100) NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_click_link_date\` (\`campaign_link_id\`, \`clicked_at\`),
          CONSTRAINT \`FK_click_campaign_link\`
            FOREIGN KEY (\`campaign_link_id\`) REFERENCES \`campaign_link\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // ── Seed system_configs ───────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT IGNORE INTO \`system_configs\`
        (id, config_key, config_value, category, label, is_secret, is_readonly, created_at, updated_at)
      VALUES
        (UUID(), 'LOGIN_HOUR_START', '5',  'access', 'Heure début connexions', 0, 0, NOW(), NOW()),
        (UUID(), 'LOGIN_HOUR_END',   '21', 'access', 'Heure fin connexions',   0, 0, NOW(), NOW())
    `);
  }

  /** Vérifie qu'une colonne critique existe. Lance une erreur bloquante si absente. */
  private async assertColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    message: string,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(table, column))) {
      throw new Error(
        `[ConvergenceProductionToMasterV2] ${message}.\n` +
        `La table \`${table}\` importée depuis production est incomplète.\n` +
        `Vérifier le schéma production avant de relancer la migration.`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️  NE JAMAIS exécuter migration:revert sur la DB production.
    // Ces DROP TABLE supprimeraient des données production réelles
    // (campaign_link, media_asset, messaging_connection_log importées depuis prod).
    // Pour annuler cette migration en production : restaurer le backup phpMyAdmin T-00:05.
    if (await queryRunner.hasTable('campaign_link_click'))
      await queryRunner.query(`DROP TABLE \`campaign_link_click\``);
    if (await queryRunner.hasTable('campaign_link'))
      await queryRunner.query(`DROP TABLE \`campaign_link\``);
    if (await queryRunner.hasTable('media_asset'))
      await queryRunner.query(`DROP TABLE \`media_asset\``);
    if (await queryRunner.hasTable('messaging_connection_log'))
      await queryRunner.query(`DROP TABLE \`messaging_connection_log\``);
  }
}
```

### 4.2 `TransformTemplateData_1748995200100.ts`

Transforme les données `whatsapp_template` production (schéma V1) vers le schéma V2.

**Contexte :** dans master, `app.module.ts` utilise le module `whatsapp-template/` (V2), pas `whatsapp_template/` (V1). La migration `FixWhatsappTemplateSchema1746620000001` ajoute déjà les colonnes V2 à la table. Cette migration transforme les données existantes.

**Prérequis :** inspecter les données réelles avant d'écrire cette migration.

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransformTemplateData_1748995200100 implements MigrationInterface {
  name = 'TransformTemplateData_1748995200100';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Vérifier si la migration de schéma V2 s'est bien exécutée
    const hasBodyText = await queryRunner.hasColumn('whatsapp_template', 'body_text');
    if (!hasBodyText) {
      throw new Error(
        'FixWhatsappTemplateSchema1746620000001 doit s\'exécuter avant TransformTemplateData. ' +
        'Vérifier l\'ordre des migrations.',
      );
    }

    // Migrer seulement les lignes production (body_text encore vide + components présent)
    // Utilise ? pour les paramètres — compatible TypeORM/MySQL driver
    const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? 'default';

    // DEFAULT_TENANT_ID est obligatoire en production.
    // Une valeur 'default' non réelle corromprait les données V2.
    if (!defaultTenantId || defaultTenantId === 'default') {
      throw new Error(
        'DEFAULT_TENANT_ID doit être défini dans .env avec l\'ID réel du tenant principal. ' +
        'Ne pas utiliser la valeur "default".',
      );
    }

    // 1. Remplir tenant_id depuis le canal associé (ou valeur obligatoire)
    await queryRunner.query(`
      UPDATE \`whatsapp_template\` t
      LEFT JOIN \`whapi_channels\` c ON c.id = t.channel_id
      SET t.tenant_id = COALESCE(c.tenant_id, ?)
      WHERE (t.tenant_id IS NULL OR t.tenant_id = 'default')
    `, [defaultTenantId]);

    // 2. Extraire body_text depuis le champ components JSON production
    //    ⚠️ Cette requête suppose une structure components = { "body": { "text": "..." } }
    //    ou  components = { "body": "..." }
    //    ou  components = { "text": "..." }
    //    Inspecter les données réelles avant le go-live et adapter si nécessaire.
    await queryRunner.query(`
      UPDATE \`whatsapp_template\`
      SET \`body_text\` = COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.body.text')),
        JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.body')),
        JSON_UNQUOTE(JSON_EXTRACT(\`components\`, '$.text')),
        ''
      )
      WHERE (\`body_text\` IS NULL OR \`body_text\` = '')
        AND \`components\` IS NOT NULL
    `);

    // 3. Extraire parameters et buttons depuis components
    await queryRunner.query(`
      UPDATE \`whatsapp_template\`
      SET
        \`parameters\` = JSON_EXTRACT(\`components\`, '$.parameters'),
        \`buttons\`    = JSON_EXTRACT(\`components\`, '$.buttons')
      WHERE \`parameters\` IS NULL
        AND \`components\` IS NOT NULL
    `);

    // 4. Renommer rejection_reason → rejected_reason (si les deux colonnes coexistent)
    const hasOldReason = await queryRunner.hasColumn('whatsapp_template', 'rejection_reason');
    const hasNewReason = await queryRunner.hasColumn('whatsapp_template', 'rejected_reason');
    if (hasOldReason && hasNewReason) {
      await queryRunner.query(`
        UPDATE \`whatsapp_template\`
        SET \`rejected_reason\` = \`rejection_reason\`
        WHERE \`rejected_reason\` IS NULL AND \`rejection_reason\` IS NOT NULL
      `);
    }

    // 5. Renommer external_id → meta_template_id (si les deux colonnes coexistent)
    const hasOldExtId = await queryRunner.hasColumn('whatsapp_template', 'external_id');
    const hasNewExtId = await queryRunner.hasColumn('whatsapp_template', 'meta_template_id');
    if (hasOldExtId && hasNewExtId) {
      await queryRunner.query(`
        UPDATE \`whatsapp_template\`
        SET \`meta_template_id\` = \`external_id\`
        WHERE \`meta_template_id\` IS NULL AND \`external_id\` IS NOT NULL
      `);
    }

    // 6. Normaliser category (varchar prod → ENUM V2)
    await queryRunner.query(`
      UPDATE \`whatsapp_template\`
      SET \`category\` = CASE UPPER(TRIM(\`category\`))
        WHEN 'MARKETING'      THEN 'MARKETING'
        WHEN 'AUTHENTICATION' THEN 'AUTHENTICATION'
        ELSE 'UTILITY'
      END
      WHERE \`category\` NOT IN ('MARKETING','UTILITY','AUTHENTICATION')
         OR \`category\` IS NULL
    `);

    // ── Vérification finale du schéma réel post-migration ────────────────────
    // FixWhatsappTemplateSchema ne convertit PAS les colonnes qui existent déjà
    // (hasColumn = true → elle les ignore). Cette vérification s'assure que le
    // schéma SQL réel correspond bien au schéma V2 attendu.
    const columns: Array<{ COLUMN_NAME: string; DATA_TYPE: string; COLUMN_TYPE: string }> =
      await queryRunner.query(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_template'
        ORDER BY ORDINAL_POSITION
      `);

    const colMap = new Map(columns.map(c => [c.COLUMN_NAME, c.COLUMN_TYPE]));

    const warnings: string[] = [];

    // category : doit être un ENUM V2, pas un VARCHAR production
    const catType = colMap.get('category') ?? '';
    if (!catType.startsWith('enum') || !catType.includes('MARKETING')) {
      warnings.push(`category : type actuel="${catType}", attendu=ENUM('MARKETING','UTILITY','AUTHENTICATION')`);
    }

    // status : doit avoir les 8 valeurs V2
    const statusType = colMap.get('status') ?? '';
    if (!statusType.includes('PAUSED') || !statusType.includes('IN_APPEAL')) {
      warnings.push(`status : type actuel="${statusType}", colonnes V2 PAUSED/IN_APPEAL/FLAGGED/DELETED manquantes`);
    }

    if (warnings.length > 0) {
      // BLOQUANT : le module whatsapp-template V2 utilise ces ENUM strictement.
      // Une valeur hors-ENUM (ex: category=NULL, status sans PAUSED) provoquera
      // une erreur TypeORM à la création ou soumission d'un template.
      // Corriger le schéma SQL avant de relancer la migration.
      throw new Error(
        '\n[TransformTemplateData] Schéma whatsapp_template incompatible avec V2 :\n  ' +
        warnings.join('\n  ') +
        '\n\nCes colonnes existent déjà en production avec un type SQL différent.' +
        '\nFixWhatsappTemplateSchema ne modifie pas les colonnes déjà présentes.' +
        '\n\nAction requise — exécuter les ALTER TABLE ci-dessous puis relancer npm run migration:run :' +
        '\n\n  -- Convertir category en ENUM V2 (si type actuel = VARCHAR) :' +
        '\n  ALTER TABLE `whatsapp_template`' +
        "\n    MODIFY COLUMN `category` ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'UTILITY';" +
        '\n\n  -- Convertir status en ENUM V2 (si valeurs V2 manquantes) :' +
        '\n  ALTER TABLE `whatsapp_template`' +
        "\n    MODIFY COLUMN `status` ENUM('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','IN_APPEAL','FLAGGED','DELETED') NOT NULL DEFAULT 'PENDING';" +
        '\n\n⚠️  Vérifier d\'abord qu\'aucune valeur existante en DB ne sort de ces ENUMs' +
        '\n   (SELECT DISTINCT category FROM whatsapp_template; / SELECT DISTINCT status FROM whatsapp_template;)' +
        '\n   avant d\'exécuter les MODIFY COLUMN.\n',
      );
    }
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Transformation de données irréversible.
    // Restaurer le backup phpMyAdmin de la DB pour annuler.
  }
}
```

> **⚠️ Action obligatoire avant go-live :** exécuter en dev `SELECT id, components FROM whatsapp_template LIMIT 20` et inspecter la structure JSON réelle pour valider que les chemins `$.body.text`, `$.parameters`, `$.buttons` sont corrects. Adapter la migration si nécessaire.

---

## 5. Audit des migrations master potentiellement destructives

`npm run migration:run` exécutera **toutes** les migrations master en attente sur la DB production importée.  
Certaines contiennent des DROP, RENAME ou des gardes bloquants. Voici l'**audit initial**, à valider définitivement par le rapport de dry-run (liste exacte des migrations exécutées + durées + erreurs).

### 5.1 Migrations à risque élevé — vérification obligatoire avant go-live

#### `20260522_drop_legacy_channel_credentials.ts` — BLOQUANT POTENTIEL

Cette migration **supprime `meta_app_id` et `meta_app_secret`** de `whapi_channels`.  
Elle contient un garde : si un canal Meta/Messenger/Instagram a `application_id IS NULL` et `meta_app_secret IS NOT NULL`, elle **lève une exception et bloque toute la migration**.

La migration `20260521_backfill_messaging_applications.ts` (qui s'exécute avant) est censée créer les `messaging_application` et renseigner `application_id` sur tous les canaux concernés. Mais le backfill ne traite que les canaux avec `meta_app_id IS NOT NULL AND meta_app_id != ''`.

**Vérification obligatoire à exécuter en dry-run staging AVANT go-live :**

```sql
-- Canaux qui feront échouer la migration DropLegacyChannelCredentials
SELECT id, label, provider, meta_app_id, meta_app_secret, application_id
FROM whapi_channels
WHERE provider IN ('meta', 'messenger', 'instagram')
  AND application_id IS NULL
  AND meta_app_secret IS NOT NULL AND meta_app_secret != '';
```

**Si cette requête retourne des lignes :** le dry-run bloquera sur `DropLegacyChannelCredentials`.  
**Résolution avant go-live :** pour chaque canal listé, créer manuellement l'entrée dans `messaging_applications` et renseigner `application_id` dans `whapi_channels`, ou s'assurer que les migrations de backfill les couvrent bien.

---

#### `20260414_remove_auto_message_legacy.ts` — SÛRE (garde présent)

Renomme `messages_predefinis` → `_legacy_messages_predefinis`, `auto_message_scope_config` → `_legacy_auto_message_scope_config`, `auto_message_keyword` → `_legacy_auto_message_keyword`.

Supprime des colonnes de `whatsapp_chat` (`auto_message_id`, etc.) et de `dispatch_settings` (`auto_message_enabled`, etc.) **uniquement si elles existent** (`hasColumn()` utilisé sur chaque DROP).

✅ Toutes les suppressions sont protégées par `hasColumn()` ou `hasTable()`. Migration safe.

---

### 5.2 Migrations avec DROP dans `down()` uniquement — sans risque

Ces migrations ont des `DROP TABLE` uniquement dans leur méthode `down()` (rollback). Elles n'affectent pas l'exécution normale de `npm run migration:run`.

| Migration | DROP dans `up()` | Verdict |
|---|---|---|
| `20260416_phase4_features.ts` | `DROP TABLE IF EXISTS whatsapp_template` → dans `down()` seulement | ✅ Sûre |
| `20260416_phase3_features.ts` | DROP tables → dans `down()` seulement | ✅ Sûre |
| `20260213_add_dispatch_settings.ts` | `dropTable('dispatch_settings')` → dans `down()` | ✅ Sûre |
| `20260213_remove_pending_messages.ts` | DROP table → dans `down()` | ✅ Sûre |

---

### 5.3 Migrations avec DROP/RENAME dans `up()` — analysées sûres

| Migration | Action dans `up()` | Pourquoi c'est sûr |
|---|---|---|
| `20260214_drop_global_uniques.ts` | DROP INDEX | Idempotent, index unique supprimé intentionnellement |
| `20260323_remove_global_provider_secrets.ts` | `DELETE FROM system_configs WHERE config_key = ?` | DELETE ciblé par clé, pas de DROP TABLE |
| `20260321_sync_all_entities.ts` | `CREATE TABLE IF NOT EXISTS` partout | Entièrement idempotente, aucun DROP dans `up()` |
| `20260216_expand_whapi_channel_token.ts` | DROP INDEX puis recréation | Séquence rebuild d'index, pas de perte de données |
| `20260226_fix_channel_fk_on_delete_set_null.ts` | DROP FK + recréation | Rebuild FK, pas de perte de données |

---

### 5.4 Rapport dry-run attendu

Avant le go-live, le dry-run sur staging doit produire un rapport qui liste :
- Toutes les migrations exécutées dans l'ordre chronologique
- Durée de chaque migration (les plus longues sur `whatsapp_message` peuvent prendre plusieurs minutes)
- Résultat de la requête de vérification `DropLegacyChannelCredentials` (doit retourner 0 ligne)
- Résultat du `verify_integrity.sql` (tous les checks critiques = 0)

```bash
# Générer le rapport dry-run
npm run migration:run 2>&1 | tee docs/migration/dry_run_report_YYYYMMDD.txt
mysql -u$USER -p$PASS db_staging < docs/migration/verify_integrity.sql >> docs/migration/dry_run_report_YYYYMMDD.txt
```

Ce rapport est un livrable obligatoire avant l'ouverture de la fenêtre de maintenance go-live.

---

## 6. Migrations déjà présentes dans master (rien à créer)

Ces migrations s'exécuteront automatiquement via `npm run migration:run` sur la DB production importée.

### 6.1 Migrations master V2 (fonctionnalités V2 pures)

| Migration | Ce qu'elle fait | Important pour |
|---|---|---|
| `FixWhatsappTemplateSchema1746620000001` | Ajoute colonnes V2 à `whatsapp_template` | Prérequis `TransformTemplateData` |
| `20260414_remove_auto_message_legacy` | Migre `messages_predefinis` → FlowBot, renomme en `_legacy_*` | Auto-message |
| `20260416_phase3_features` | Crée canned_response, label, gdpr_optout | V2 |
| `20260416_phase4_features` | Crée whatsapp_broadcast | V2 |
| `20260416_phase5_features` et `5b/5c` | CRM, SLA, audit, RBAC | V2 |
| `20260416_phase6_features` | Outbound webhooks, sentiment | V2 |
| `20260512_add_commercial_group` | Crée commercial_group | V2 |
| `20260512_add_working_today_to_commercial` | Ajoute is_working_today | V2 |
| `20260520_add_messaging_application` | Crée messaging_application | V2 |
| `DispatchModeColumn1747267200001` | Ajoute dispatch_mode à dispatch_settings | V2 |
| `AddCommercialPlanning*` | Planning des absences | V2 |
| `BackfillWindowExpiresAt1781654400001` | Backfille `window_expires_at` depuis `last_client_message_at + 24h` pour les conversations `actif`/`en_attente` sans session active | Correctif critique — déblocage champ saisie |
| *(toutes les autres migrations master)* | Fonctionnalités V2 | V2 |

### 6.2 Migrations production à porter dans master (branche `feature/convergence-production`)

Ces migrations existent dans la branche `production` mais **pas dans master**. Elles doivent être portées dans master pour que `npm run migration:run` les exécute lors du go-live. Sans elles, les modules backend correspondants ne fonctionneront pas (tables manquantes, colonnes manquantes).

> **Ordre d'exécution** : les migrations sont exécutées par TypeORM dans l'ordre lexicographique de leur timestamp. Les migrations ci-dessous doivent donc respecter les dépendances indiquées.

| Migration (fichier .ts) | Ce qu'elle fait | Dépendances |
|---|---|---|
| `OutboundHsm1746000000001` | Crée `whatsapp_template` (schéma V1 production) | Aucune — doit s'exécuter avant `FixWhatsappTemplateSchema` |
| `OutboundHsmV2_1746000000002` | Ajoute `rejection_reason` à `whatsapp_template` | Après `OutboundHsm1746000000001` |
| `ConnectionLog1746057600007` | Crée `messaging_connection_log` (IF NOT EXISTS — idempotente avec `ConvergenceProductionToMasterV2`) | Aucune |
| `ReadOnlyConfig1746144000008` | Ajoute `read_only_after_messages` (whapi_channels), `poste_message_count_since_last_client` (whatsapp_chat), `read_only_max_messages` (dispatch_settings) | Aucune |
| `AddTrafficGroupingIndexes1748995200001` | Ajoute colonnes virtuelles `hour_of_day`, `day_of_week_n` sur `whatsapp_message` + 3 index covering trafic | Aucune |
| `ConversationRestrictionAccess1748649600001` | Crée `commercial_conversation_access` (suivi accès/réponses par commercial) | Aucune |
| `AddMessageReadTracking1748822400001` | Ajoute `read_by_commercial_id`, `read_by_commercial_at` (whatsapp_message) + `messages_read_count`, `messages_handled_count`, `last_activity_at` (whatsapp_commercial) | Aucune |
| `AddIdleDisconnectSettings1748822400002` | Ajoute `max_read_messages_per_minute`, `idle_disconnect_enabled`, `idle_disconnect_minutes` à `dispatch_settings` | Aucune |
| `AddConversationTurnTracking1748908800001` | Ajoute `is_first_reply` (TINYINT) à `whatsapp_message` | Aucune |
| `AddCooldownAndWarningSettings1748908800002` | Ajoute `read_cooldown_seconds`, `idle_warning_seconds` à `dispatch_settings` | Aucune |
| `FixUnreadCountBatch1748995200002` | Recalcule `unread_count` (fermé → 0, actif → recompte depuis whatsapp_message) | Aucune — opération de données |
| `CleanupStaleConnectionLogs1749081600001` | Supprime les logs connexion antérieurs à la date de déploiement (données corrompues) | Après `ConnectionLog1746057600007` |
| `AddMediaToAutoMessage1749168000001` | Ajoute `media_asset_id` (FK → media_asset) à `messages_predefinis` | Après `ConvergenceProductionToMasterV2_1748995200099` (qui crée `media_asset`) |
| `RestoreOrphanedSessions1749254400001` | Backfill `messaging_connection_log` : ferme les sessions fantômes, reconstitue les sessions des commerciaux connectés | Après `ConnectionLog1746057600007` |
| `AddLocalMediaStorage1749427200001` | Ajoute `local_url`, `local_path`, `provider_url_expired`, `downloaded_at` à `whatsapp_media` | Aucune |
| `AddMediaPanelToPoste1749513600001` | Ajoute `media_panel_enabled`, `media_panel_types` à `whatsapp_poste` | Aucune |
| `AddProfilePicFetchedAt1750041600001` | Ajoute `profile_pic_fetched_at` à `whatsapp_chat` + étend `chat_pic`/`chat_pic_full` à VARCHAR(255) | Aucune |
| `AddQuizSystem1749686400000` | Crée les 7 tables du système QCM : `quiz_category`, `quiz_question`, `quiz_answer`, `quiz_session`, `quiz_session_question`, `quiz_attempt`, `quiz_attempt_answer` | Aucune |
| `AddMetaAdReferral1780272000001` | Crée `meta_ad_referral` + ajoute `is_ctwa` (TINYINT) et `active_session_id` (CHAR(36)) à `whatsapp_chat` | Aucune |
| `AddMetaAdKpiIndex1780272000002` | Ajoute index `IDX_msg_ctwa_kpi` sur `whatsapp_message` (KPIs CTWA) | Après `AddMetaAdReferral1780272000001` |
| `FixMetaAdReferralDefaults1780358400001` | Ajoute DEFAULT '' sur `source_type` et `source_id` dans `meta_ad_referral` | Après `AddMetaAdReferral1780272000001` |
| `AddChatSessionEntity1780531200000` | Crée `chat_session` + ajoute `active_session_id` sur `whatsapp_chat` (idempotent si déjà créé par `AddMetaAdReferral`) | Après `AddMetaAdReferral1780272000001` |
| `AddWindowReminderSection1780531200001` | Étend l'ENUM `trigger_type` avec `'window_reminder'` + ajoute `last_window_reminder_sent_at` à `whatsapp_chat` | Après `AddChatSessionEntity1780531200000` |
| `AddWindowReminderCronFields1780531200002` | Ajoute 6 colonnes à `cron_config` : plages horaires window_reminder (normal/CTWA), min_replies, ttl_days_ctwa | Après `AddWindowReminderSection1780531200001` |
| `FixActiveSessionIdCollation1780704000000` | Corrige la collation de `whatsapp_chat.active_session_id` (utf8mb4_unicode_ci) pour éviter ER_CANT_AGGREGATE_2COLLATIONS | Après `AddChatSessionEntity1780531200000` |
| `FixInstagramMessageIdLength1780876800001` | Étend `message_id`, `external_id`, `provider_message_id` à VARCHAR(512) sur `whatsapp_message` (IDs Instagram trop longs) | Aucune |
| `AddWindowExpiresAtToChat1781522555000` | Ajoute `window_expires_at` (TIMESTAMP) à `whatsapp_chat` + backfill depuis chat_session active | Après `AddChatSessionEntity1780531200000` |
| `BackfillWindowExpiresAt1781654400001` | Backfille `window_expires_at` pour les conversations actives/en_attente sans session (last_client_message_at + 24h) | Après `AddWindowExpiresAtToChat1781522555000` |

> **Note `business_hours_config` :** cette table a le **même schéma** en production et dans master. Elle est importée telle quelle via phpMyAdmin. Aucune migration n'est nécessaire. La migration FlowBot la lit en fail-open si elle est vide — si elle a 7 lignes (une par jour), les horaires de production seront respectés.

> **Note `OutboundHsm1746000000001` :** cette migration crée `whatsapp_template` avec le schéma V1 production (status ENUM à 3 valeurs, pas de `body_text`, etc.). Elle doit s'exécuter **avant** `FixWhatsappTemplateSchema1746620000001` (master) qui ajoute les colonnes V2. L'ordre est garanti par les timestamps (1746000000001 < 1746620000001).

> **Attention `AddWindowReminderSection1780531200001` :** cette migration modifie l'ENUM `trigger_type` de `messages_predefinis`. Si la migration `20260414_remove_auto_message_legacy` (master) a déjà renommé la table en `_legacy_messages_predefinis`, cette migration échouera. À vérifier lors du dry-run staging — si conflit, adapter le nom de table dans la migration.

---

## 7. Script de vérification d'intégrité

Fichier : `docs/migration/verify_integrity.sql`

```sql
-- ================================================================
-- Vérification d'intégrité post-migration
-- À exécuter après npm run migration:run
-- Tous les checks ORPHAN / DUPLICATE doivent retourner 0
-- ================================================================

-- 1. Comptages critiques (à comparer avec les chiffres production)
SELECT 'COUNT_COMMERCIAL'      AS check_name, COUNT(*) AS val FROM whatsapp_commercial  UNION ALL
SELECT 'COUNT_CHAT',                           COUNT(*) FROM whatsapp_chat               UNION ALL
SELECT 'COUNT_MESSAGE',                        COUNT(*) FROM whatsapp_message            UNION ALL
SELECT 'COUNT_CHANNEL',                        COUNT(*) FROM whapi_channels              UNION ALL
SELECT 'COUNT_TEMPLATE',                       COUNT(*) FROM whatsapp_template           UNION ALL
SELECT 'COUNT_CAMPAIGN_LINK',                  COUNT(*) FROM campaign_link               UNION ALL
SELECT 'COUNT_MEDIA_ASSET',                    COUNT(*) FROM media_asset                 UNION ALL
SELECT 'COUNT_CONNECTION_LOG',                 COUNT(*) FROM messaging_connection_log    UNION ALL
SELECT 'COUNT_BUSINESS_HOURS',                 COUNT(*) FROM business_hours_config;

-- 2. FK orphelines — messages sans chat
SELECT 'ORPHAN_MSG_NO_CHAT' AS check_name, COUNT(*) AS val   -- doit être 0
FROM whatsapp_message m
LEFT JOIN whatsapp_chat c ON m.chat_id = c.chat_id
WHERE c.chat_id IS NULL AND m.deletedAt IS NULL;

-- 3. FK orphelines — chats sans commercial assigné valide
SELECT 'ORPHAN_CHAT_NO_COMMERCIAL' AS check_name, COUNT(*) AS val   -- doit être 0
FROM whatsapp_chat c
LEFT JOIN whatsapp_commercial com ON c.assigned_commercial_id = com.id
WHERE com.id IS NULL AND c.assigned_commercial_id IS NOT NULL;

-- 4. FK orphelines — clics sans lien campagne
SELECT 'ORPHAN_CAMPAIGN_CLICKS' AS check_name, COUNT(*) AS val   -- doit être 0
FROM campaign_link_click clk
LEFT JOIN campaign_link lnk ON clk.campaign_link_id = lnk.id
WHERE lnk.id IS NULL;

-- 5. Doublons sur emails commerciaux
SELECT 'DUPLICATE_COMMERCIAL_EMAIL' AS check_name, COUNT(*) AS val   -- doit être 0
FROM (SELECT email, COUNT(*) n FROM whatsapp_commercial GROUP BY email HAVING n > 1) t;

-- 6. Templates — body_text vide (ALERTE, pas forcément bloquant)
--    Inspecter les lignes remontées avant de décider si c'est bloquant
SELECT 'TEMPLATE_NO_BODY' AS check_name, COUNT(*) AS val
FROM whatsapp_template WHERE (body_text IS NULL OR body_text = '') AND components IS NOT NULL;

-- 7. business_hours_config : vérifier que les 7 jours sont présents
SELECT 'BIZ_HOURS_DAYS_COUNT' AS check_name, COUNT(*) AS val   -- doit être 7
FROM business_hours_config;

SELECT 'BIZ_HOURS_MISSING_DAYS' AS check_name, COUNT(*) AS val   -- doit être 0
FROM (
  SELECT d.day FROM (
    SELECT 0 AS day UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
    UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
  ) d
  LEFT JOIN business_hours_config b ON b.day_of_week = d.day
  WHERE b.id IS NULL
) t;

-- 8. Messages sans channel (via chat → channel)
SELECT 'MSG_NO_CHANNEL' AS check_name, COUNT(*) AS val   -- doit être 0
FROM whatsapp_message m
JOIN whatsapp_chat c ON m.chat_id = c.chat_id
LEFT JOIN whapi_channels ch ON c.channel_id = ch.id
WHERE ch.id IS NULL AND m.deletedAt IS NULL;

-- 9. Agrégats critiques (comparer avec production)
SELECT direction, COUNT(*) AS total_messages
FROM whatsapp_message GROUP BY direction;

-- 10. Sessions connexion encore ouvertes (indicatif)
SELECT 'OPEN_SESSIONS' AS check_name, COUNT(*) AS val
FROM messaging_connection_log WHERE logout_at IS NULL;

-- 11. Backfill window_expires_at — conversations actives/en_attente encore sans valeur
--     Doit être 0 si BackfillWindowExpiresAt1781654400001 s'est bien exécutée
SELECT 'WINDOW_EXPIRES_AT_NULL_ACTIVE' AS check_name, COUNT(*) AS val   -- doit être 0
FROM whatsapp_chat
WHERE status IN ('actif', 'en_attente')
  AND window_expires_at IS NULL
  AND last_client_message_at IS NOT NULL
  AND deletedAt IS NULL;

-- 12. window_expires_at cohérent (ne doit pas être antérieur à last_client_message_at)
SELECT 'WINDOW_EXPIRES_BEFORE_LAST_CLIENT' AS check_name, COUNT(*) AS val   -- doit être 0
FROM whatsapp_chat
WHERE window_expires_at IS NOT NULL
  AND last_client_message_at IS NOT NULL
  AND window_expires_at < last_client_message_at
  AND deletedAt IS NULL;

-- 13. chat_session — sessions encore ouvertes pour des chats fermés
SELECT 'SESSION_OPEN_ON_CLOSED_CHAT' AS check_name, COUNT(*) AS val   -- doit être 0
FROM chat_session s
JOIN whatsapp_chat c ON s.whatsapp_chat_id = c.id
WHERE s.ended_at IS NULL
  AND c.status = 'fermé'
  AND c.deletedAt IS NULL;

-- 14. meta_ad_referral — orphelins (chat_id inexistant)
SELECT 'ORPHAN_META_AD_REFERRAL' AS check_name, COUNT(*) AS val   -- doit être 0
FROM meta_ad_referral r
LEFT JOIN whatsapp_chat c ON r.chat_id = c.id
WHERE c.id IS NULL;

-- 15. commercial_conversation_access — entrées sans commercial valide
SELECT 'ORPHAN_CONV_ACCESS_NO_COMMERCIAL' AS check_name, COUNT(*) AS val   -- doit être 0
FROM commercial_conversation_access a
LEFT JOIN whatsapp_commercial com ON a.commercial_id = com.id
WHERE com.id IS NULL;

-- 16. Quiz — sessions sans questions associées (indicatif)
SELECT 'QUIZ_SESSION_NO_QUESTIONS' AS check_name, COUNT(*) AS val
FROM quiz_session qs
LEFT JOIN quiz_session_question qsq ON qsq.quiz_session_id = qs.id
WHERE qsq.id IS NULL;

-- 17. messages_predefinis avec media_asset_id orphelin
SELECT 'ORPHAN_AUTO_MSG_MEDIA' AS check_name, COUNT(*) AS val   -- doit être 0
FROM messages_predefinis mp
LEFT JOIN media_asset ma ON mp.media_asset_id = ma.id
WHERE mp.media_asset_id IS NOT NULL AND ma.id IS NULL;

-- 18. Commerciaux avec sessions connexion encore ouvertes après migration
SELECT 'ORPHAN_CONNECTION_SESSIONS' AS check_name, COUNT(*) AS val
FROM messaging_connection_log
WHERE logout_at IS NULL
  AND login_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);
-- Note : des sessions ouvertes > 24h = suspects (commerciaux déconnectés mais session non fermée)

-- 19. Conversations CTWA sans referral associé
SELECT 'CTWA_WITHOUT_REFERRAL' AS check_name, COUNT(*) AS val
FROM whatsapp_chat c
WHERE c.is_ctwa = 1
  AND NOT EXISTS (SELECT 1 FROM meta_ad_referral r WHERE r.chat_id = c.id)
  AND c.deletedAt IS NULL;
-- Note : des valeurs > 0 sont attendues si is_ctwa a été backfillé sans referral complet
-- C'est une alerte, pas un bloquant.
```

---

## 8. Critères Go/NoGo

### 7.1 Sur la DB dev (avant portage P0)

| Critère | Seuil Go | Niveau |
|---|---|---|
| `npm run migration:run` sans erreur | ✅ obligatoire | Bloquant |
| Tous les checks ORPHAN = 0 | ✅ obligatoire | Bloquant |
| COUNT_COMMERCIAL = COUNT prod ± 0 | ✅ obligatoire | Bloquant |
| COUNT_MESSAGE dans la bonne plage | ≤ 0.1% d'écart | Bloquant |
| BIZ_HOURS_DAYS_COUNT = 7 | ✅ obligatoire | Bloquant |
| TEMPLATE_NO_BODY | Inspecter avant blocage | Alerte |

### 7.2 Sur la DB dev (après portage P0, avant go-live)

| Critère | Niveau |
|---|---|
| `tsc --noEmit` backend : 0 erreur | Bloquant |
| `next build` front + admin : 0 erreur | Bloquant |
| Smoke test : connexion commercial | Bloquant |
| Smoke test : envoi + réception message | Bloquant |
| Smoke test : lien campagne (redirect + clic enregistré) | Bloquant |
| Smoke test : upload média + sélection dans message auto | Bloquant |
| Smoke test : déconnexion idle (après N minutes) | Bloquant |
| Smoke test : FlowBot trigger sur message entrant | Bloquant |

---

## 9. Procédure Go/NoGo go-live — principe général (référence)

> **Note :** cette section décrit les étapes dans l'ordre logique à titre de référence.  
> La **procédure réelle utilisée** est la section 12 (pipeline GitHub Actions + Docker).  
> En cas de contradiction entre les deux, la section 12 fait foi.

### Procédure Go/NoGo go-live (fenêtre de maintenance)

```
T-00:00  Page de maintenance affichée (front + admin)
T-00:02  Arrêt des workers BullMQ production
T-00:05  Export DB production final via phpMyAdmin → backup de sécurité

          --- Bascule DB ---
T-00:10  Modifier .env V2 : MYSQL_HOST → serveur production, MYSQL_DATABASE → db_production
T-00:12  npm run migration:run   ← UNIQUE commande de migration
T-00:30  Lancer verify_integrity.sql → vérifier tous les critères Go/NoGo
T-00:40  Smoke tests rapides (connexion + message + lien)

          --- Go/NoGo ---
T-00:45  Go   → démarrer workers BullMQ V2, retirer page maintenance
         NoGo → rollback (section 10)

T-01:00  Monitoring post-déploiement (logs + erreurs)
T-01:30  Fin de la surveillance active
```

**Durée estimée :** 45 minutes (prévoir fenêtre de 2h pour absorber les imprévus).

---

## 10. Rollback

### Point de non-retour : l'instant où `migration:run` commence (T+00:12)

**La DB production est modifiée dès la première instruction SQL de `migration:run`**,  
même si aucun utilisateur n'a encore écrit. Il n'existe pas de "rollback fiable sans restauration"  
après ce point.

| Moment | DB touchée ? | Rollback nécessaire |
|---|---|---|
| Avant T+00:12 (avant `migration:run`) | ❌ Non | Annuler la commande, aucune restauration |
| Entre T+00:12 et T+00:45 (après `migration:run`, avant ouverture) | ✅ Oui | **Restauration backup T-00:05 obligatoire** |
| Après T+00:45 (utilisateurs actifs) | ✅ Oui | Best effort — voir ci-dessous |

### Rollback avant ouverture utilisateurs (T+00:12 → T+00:45)

```
1. Arrêter V2 (workers BullMQ + API)
2. Restaurer DB production depuis backup T-00:05 via phpMyAdmin
   (Importer le fichier backup_prod_T-00-05.sql.gz)
3. Relancer production V1
Durée estimée : 15-30 min selon taille de la DB
```

> ⚠️ Ne pas tenter de rejouer `migration:run` sans analyser l'erreur.  
> TypeORM n'exécute pas les migrations dans une transaction globale — l'état DB peut être partiel.

### Après T+00:45 (écritures utilisateurs démarrées) — best effort

Le rollback après ouverture aux utilisateurs finaux est complexe et potentiellement destructeur pour  
les nouvelles données V2. Il doit être **évité à tout prix** via la rigueur de la validation staging.

Si le rollback est inévitable :
```
1. Geler immédiatement V2 (maintenance page)
2. Exporter les nouvelles écritures depuis le timestamp de bascule (manuellement depuis phpMyAdmin)
3. Restaurer la DB production depuis le backup T-00:05
4. Rejouer manuellement les nouvelles écritures critiques (messages, chats nouveaux)
   ⚠️ Les données écrites dans des tables V2-only (labels, broadcasts, audit_log…)
   ne peuvent pas être portées vers V2 → perte acceptée
5. Relancer V1
```

> **La meilleure protection contre ce scénario est un dry-run staging réussi à 100%.**

---

## 11. Axe B — Convergence fonctionnelle (portage code)

### 10.1 Branche dédiée

Créer la branche `feature/convergence-production` depuis `master` et y porter tous les modules P0.

### 10.2 Modules P0 à porter (sprint B1)

| # | Module/Composant | Effort |
|---|---|---|
| B1-1 | `src/media-asset/` (backend) | M |
| B1-2 | `src/campaign-link/` (backend) | M |
| B1-3 | `src/connection-log/` (backend) | S |
| B1-4 | `message-read.service.ts` + rate-limiter (backend) | S |
| B1-5 | `commercial-stats.service.ts` (backend) | S |
| B1-6 | `idle-disconnect.job.ts` + `tasks.service.ts` (backend) | M |
| B1-7 | `IdleAndCooldownWrapper`, `IdleWarningModal`, `ReadCooldownModal`, `useIdleTimer` (front) | S |
| B1-8 | `MediathequeView` + `MediaPickerModal` (admin) | M |
| B1-9 | `CampaignLinksView` (admin) | S |
| B1-10 | `MessageTrafficView` + `ConversationsTrafficTab` (admin) | S |
| B1-11 | `DedicatedChannelsView` + `LectureSeuleView` (admin) | S |
| B1-12 | Fonctions API production dans modules `admin/lib/api/` master | M |
| B1-13 | Validation : `tsc --noEmit` + `next build` sans erreur | S |
| B1-14 | `src/conversation-restriction/` (backend) — `ConversationRestrictionService`, `ConversationRestrictionAccess` entity | M |
| B1-15 | `src/chat-session/` (backend) — `ChatSession` entity, `ChatSessionService` (source de vérité session CTWA/normal) | L |
| B1-16 | `src/meta-ad-referral/` (backend) — `MetaAdReferral` entity, handler webhook referral, fenêtre 72h CTWA | M |
| B1-17 | `src/quiz/` (backend) — module QCM complet (catégories, questions, sessions, tentatives, résultats) | L |
| B1-18 | `src/media-storage/` (backend) — `MediaStorageService`, `MediaDownloadService`, `MediaBackfillService`, `ProfilePicService` | M |
| B1-19 | Panneau médias poste — endpoints `GET/PUT /poste/:id/panel` + `GET /poste-panel/media` (backend + admin + front) | M |
| B1-20 | Module Window Reminder (cron J) — job d'envoi de rappel avant expiration fenêtre 24h/72h | M |
| B1-21 | `front/src/components/quiz/` — pages quiz commercial (accueil, question par question, résultat) | M |
| B1-22 | `admin/src/app/dashboard/quiz/` — gestion QCM admin (catégories, questions, sessions, résultats) | L |

### 10.2b Correctifs fonctionnels à porter de `production` vers `master` (sprint B1, bloquants avant go-live)

Ces correctifs ont été implémentés sur la branche `production` en 2026-06-17 (RAPPORT_BUG_FENETRE_ET_ATTENTE.md + RAPPORT_BUG_RESTRICTION_COMMERCIAUX.md + PLAN_CORRECTION_BUG_RESTRICTION.md). Ils doivent être portés dans la branche `feature/convergence-production`.

| # | Fichier | Changement | Nature |
|---|---|---|---|
| C1 | `front/src/components/chat/ChatMainArea.tsx` | Condition `windowExpired` : `windowExpiresAt != null &&` ajouté — distingue `null` (pas de session) de "fenêtre expirée" | Fix critique Bug #1 |
| C2 | `message_whatsapp/src/dispatcher/dispatcher.service.ts` | Nouvelle méthode `reactivateWaitingConversationsForPoste(posteId)` — remet `ACTIF` toutes les conversations `EN_ATTENTE` du poste à la reconnexion | Fix Bug #5 |
| C3 | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Appel de `reactivateWaitingConversationsForPoste(posteId)` dans `handleConnection()`, après `posteService.setActive()` | Fix Bug #5 |
| C4 | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Fermeture immédiate via `closeExpiredChatByWindowExpiry()` dans `handleSendMessage` quand `windowExpired = true` + injection `ChatSessionService` | Fix comportement fenêtre |
| C5 | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Méthode privée `isRestrictionExemptPoste(agent)` — factorise la détection "config désactivée OU poste dédié" (évite triple duplication) | Factorisation |
| C6 | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Guard `RESTRICTION_TRIGGERED` dans `handleSendMessage` — vérifie `checkRestriction()` avant envoi, bloque si une autre conversation est non répondue | Fix Bug #3 (guard backend) |
| C7 | `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Nouveau handler `@SubscribeMessage('restriction:check')` — lecture seule du statut de restriction, sans `recordAccess()` parasite | Fix Bug #3 (reconnect) |
| C8 | `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts` | Filtre poste : `chat.poste_id !== posteId` (suppression de `&& chat.poste_id !== null`) — exclut les conversations sans poste du quota | Fix Bug #7 |
| C9 | `front/src/components/WebSocketEvents.tsx` | Émission `socket.emit('restriction:check')` dans `refreshAfterConnect` au (re)connect — restaure le modal de restriction après F5 | Fix Bug #3 (frontend) |
| C10 | `front/src/components/WebSocketEvents.tsx` | Code `RESTRICTION_TRIGGERED` ajouté dans le handler `MESSAGE_SEND_ERROR` — nettoie le message optimiste et affiche l'erreur | Fix Bug #3 (feedback UI) |

**Dépendances entre correctifs :**
- C8 doit être porté avant C6 (le guard backend doit raisonner sur un comptage juste).
- C5 doit être porté avant C6 et C7 (factorisation requise pour éviter la triple duplication).
- C9 et C10 dépendent de C7 (le handler `restriction:check` backend doit exister).

**Impact sur les tests :** après portage, vérifier `npm test -- --testPathPattern=conversation-restriction` (cas `poste_id=null` exclu du décompte) et `npm test -- --testPathPattern=gateway` (envoi refusé quand une autre conv est non répondue).

---

### 10.2c Correctifs UX/qualité supplémentaires à porter (depuis `PLAN_CORRECTION_*.md` et `RAPPORT_BUG_*.md` 2026-06-15..17)

Ces correctifs ont été identifiés et documentés dans la branche `production`. Ils ne nécessitent pas de migration SQL mais doivent être portés dans `feature/convergence-production`.

| # | Fichier | Changement | Nature |
|---|---|---|---|
| D1 | `message_whatsapp/src/jorbs/read-only-enforcement.job.ts` + `src/chat-session/chat-session.service.ts` | Utiliser `ttlDaysCtwa` depuis `cron_config` au lieu de la valeur codée en dur `72` | Fix correctif cron fermeture CTWA (PLAN_CORRECTION_CRON_FERMETURE_FENETRE_2026-06-15) |
| D2 | `admin/src/app/ui/ConversationsView.tsx` | Auto-scroll conditionnel (ne scroller vers le bas que si déjà en bas) — corriger le scroll forcé qui empêche de lire l'historique | Fix UX admin scroll chat (PLAN_CORRECTION_SCROLL_CHAT_ADMIN_2026-06-15) |
| D3 | `admin/src/app/ui/ConversationsView.tsx` + backend `GET /chats?q=` | Recherche backend réelle avec debounce au lieu de filtre mémoire — le front doit déclencher une requête HTTP sur saisie (PLAN_CORRECTION_RECHERCHE_CONVERSATIONS_2026-06-15) | Fix UX recherche conversations |
| D4 | `front/src/components/conversation/conversationOptionMenu.tsx` | Supprimer `'fermé'` du tableau des options accessibles aux commerciaux | Fix fermeture réservée admin (PLAN_FERMETURE_CONVERSATION_ADMIN_ONLY_2026-06-16) |
| D5 | `admin/` | Ajouter bouton "Fermer la conversation" dans l'interface admin (endpoint PATCH /chats/:chat_id déjà présent) | Fix fermeture côté admin (PLAN_FERMETURE_CONVERSATION_ADMIN_ONLY_2026-06-16) |

### 10.3 Modules P1 (sprint B2, après validation B1)

| # | Module/Composant | Effort |
|---|---|---|
| B2-1 | Vérifier couverture FlowBot des business hours | S |
| B2-2 | `ActivityPanel` front + `callButton` front | S |
| B2-3 | `ChannelStatsView` admin | S |
| B2-4 | Vérifier `modules/templates/TemplatesView` master vs `TemplatesView` production | S |
| B2-5 | Photo de profil Messenger/Instagram — `ProfilePicService` + stockage local (PLAN_IMPLEMENTATION_PHOTOS_PROFIL_TOUS_PROVIDERS_2026-06-16) | M |
| B2-6 | KPIs CTWA / métriques Meta Ad Referral — endpoint admin (dépend de `meta_ad_referral` + index `IDX_msg_ctwa_kpi`) | S |

### 10.4 Checklist de non-régression finale

- [ ] Connexion commercial → session dans `messaging_connection_log`
- [ ] Inactivité → avertissement → déconnexion automatique
- [ ] Cooldown entre lectures → modal visible
- [ ] Lien campagne → redirect + clic enregistré + stats admin
- [ ] Upload média → médiathèque → sélection dans message
- [ ] Trafic messages → graphique 24h + KPIs admin
- [ ] Mode lecture seule → compteur respecté
- [ ] Canaux dédiés → comportement exclusif préservé
- [ ] Messages auto / FlowBot → tous les triggers actifs en production fonctionnent
- [ ] Templates HSM → création + soumission + statut visible
- [ ] FlowBot V2 → créer un flow + déclencher
- [ ] Labels, réponses prédéfinies, audit trail → fonctionnent
- [ ] Restriction conversations — modal bloquant correctement déclenché + restauré après F5
- [ ] Fenêtre 24h — champ saisie bloqué uniquement si window_expires_at dans le passé (pas si null)
- [ ] Fenêtre 72h CTWA — conversation via pub Meta → session 72h correctement ouverte
- [ ] Rappel fenêtre (Window Reminder J) — cron envoie message avant expiration
- [ ] Chat session — `chat_session` créée à chaque nouveau message client, fermée à la clôture
- [ ] Quiz quotidien — commercial doit répondre au quiz avant d'accéder au chat (si session active)
- [ ] Panneau médias poste — tiroir latéral visible si activé par l'admin pour le poste
- [ ] Stockage local médias — médias téléchargés localement, `local_url` renseignée et servie correctement
- [ ] Fermeture conversation — commercial ne peut plus fermer, seul l'admin peut via bouton dédié
- [ ] Messages Instagram — `message_id` VARCHAR(512) ne tronque plus les IDs longs
- [ ] Photo de profil — `profile_pic_fetched_at` mis à jour après résolution Messenger/Instagram

---

## 12. Intégration CI/CD — GitHub Actions + Docker ← Procédure officielle de go-live

> Cette section est la **procédure réelle à suivre**. Elle remplace la séquence manuelle de la section 9  
> qui sert uniquement de référence conceptuelle.

Le déploiement utilise deux workflows distincts :

| Workflow | Déclencheur | Serveur cible | Image tag |
|---|---|---|---|
| `ci-cd.yml` | Push sur `master` | Serveur **dev** | `:latest` |
| `deploy-production.yml` | Push sur `production` | Serveur **production** | `:prod` |

**Dans les deux cas**, le pipeline exécute déjà `migration:run:prod` avant `docker compose up` :

```yaml
# Extrait existant — positionné correctement dans les deux workflows
docker run --rm \
  --env-file ./message_whatsapp/.env \
  --add-host host.docker.internal:host-gateway \
  ghcr.io/${{ github.repository }}/back:prod \
  npm run migration:run:prod
```

---

### 12.1 Flux go-live complet via CI/CD

```
1. Merge feature/convergence-production → master
   → Push master → ci-cd.yml → migration:run sur DB dev → deploy dev server
   → Valider le dry-run staging (vérifier verify_integrity.sql sur DB dev)

2. Avant le push production — ÉTAPES MANUELLES OBLIGATOIRES :
   a. Activer la page de maintenance (front + admin inaccessibles)
   b. Arrêter les workers BullMQ production (éviter écritures pendant migration)
   c. Prendre le backup DB via phpMyAdmin (ou laisser le pipeline le faire — voir 12.4)
   ⚠️  Ne pas pusher production sans avoir fait ces 3 étapes.
      Si V1 tourne pendant migration:run, les tables renommées/colonnes supprimées
      cassent le code V1 en production immédiatement.

3. Merge master → production  (ou push direct selon workflow)
   → Push production → deploy-production.yml → migration:run sur DB PRODUCTION
   → deploy production server

4. Vérifier les logs GitHub Actions (section 12.6)
   ⚠️  Les conteneurs V2 sont déjà up à ce stade. La page de maintenance doit rester active
       jusqu'à validation des smoke tests — ne pas la retirer avant.
   → Smoke tests OK : retirer la page de maintenance → ouverture aux utilisateurs
   → Smoke tests KO ou logs en erreur : rollback (section 12.5), maintenance maintenue
```

> **Le push `production` est le point de non-retour.** Une fois lancé, `migration:run` modifie la DB.  
> La page de maintenance doit être active **avant** ce push, pas après.

---

### 12.2 Ce que le pipeline gère — et ce qu'il ne gère pas

| | Pipeline actuel | Pour ce go-live |
|---|---|---|
| Migration DB (`migration:run:prod`) | ✅ Automatique, avant `docker compose up` | ✅ Couvert |
| Rollback images Docker | ✅ Tag `:prod-previous` restauré si `docker compose up` échoue | ✅ Couvert |
| Rollback DB | ❌ **Non géré** — le pipeline ne restaure pas la DB | ⚠️ Manuel (backup phpMyAdmin) |
| Backup DB avant migration | ❌ Absent du pipeline actuel | **Pour ce go-live :** ajouter le step 12.4 (backup automatique) OU faire backup manuel phpMyAdmin — les deux sont équivalents. L'un ou l'autre est **obligatoire** avant le push `production`. |
| Page de maintenance | ❌ Absente | ⚠️ À activer manuellement avant le push `production` |
| Durée des index (`whatsapp_message`) | ❌ Pas de timeout configuré | ⚠️ Peut dépasser le timeout SSH par défaut |

---

### 12.3 Risque critique — désalignement DB / image Docker

Le pipeline fait :
```
1. migration:run  → DB migrée au schéma V2
2. docker compose up → conteneurs V2 démarrés
```

Si `docker compose up` échoue (étape 2), le pipeline restaure l'image `:prod-previous` (V1)  
et relance `docker compose up` avec l'ancienne image.

**Problème :** la DB est déjà au schéma V2. L'image V1 ne connaît pas les nouvelles tables/colonnes.  
→ L'application V1 démarrera mais sera **partiellement cassée** (erreurs TypeORM sur les nouvelles colonnes).

**Ce cas n'est pas sûr pour cette migration.** Les migrations de convergence ne sont pas toutes additives :
- `remove_auto_message_legacy` **renomme** `messages_predefinis` — si V1 tourne encore, toute requête sur cette table échoue immédiatement
- `drop_legacy_channel_credentials` **supprime** `meta_app_id`/`meta_app_secret` — le code V1 qui lit ces colonnes plante

**Règle absolue pour ce go-live :** la page de maintenance et l'arrêt des workers doivent être activés **avant** le push `production`, pas après. Si V1 tourne pendant `migration:run`, on risque des erreurs en production sur des tables renommées/colonnes supprimées.

---

### 12.4 Modifications recommandées au pipeline pour ce go-live

Le pipeline existant est adapté aux migrations incrémentales rapides. Pour cette migration exceptionnelle (première convergence avec données production), deux ajustements sont recommandés dans `deploy-production.yml` :

#### Ajout 1 — Backup automatique avant migration

```yaml
# À ajouter dans le job deploy, avant le bloc "Migrations AVANT de démarrer les containers"
- name: Backup DB before migration
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.PROD_SSH_HOST }}
    username: ${{ secrets.PROD_SSH_USER }}
    key: ${{ secrets.PROD_SSH_KEY }}
    script: |
      set -e
      # Charger les variables DB depuis le .env du backend (présent sur le serveur)
      # MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE sont définis dans ce fichier
      set -a && source /var/www/whatsapp/message_whatsapp/.env && set +a

      BACKUP_FILE="/var/backups/db_prod_$(date +%Y%m%d_%H%M%S).sql.gz"

      # mysqldump via le container DB, credentials chargés depuis .env côté host
      docker exec whatsapp-db \
        mysqldump -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --single-transaction "${MYSQL_DATABASE}" \
        | gzip > "$BACKUP_FILE"

      echo "Backup créé : $BACKUP_FILE"
      ls -lh "$BACKUP_FILE"
```

> Ce backup est le filet de sécurité si le rollback DB devient nécessaire.  
> À **désactiver ou supprimer** après le go-live V2 — inutile pour les migrations incrémentales futures.

#### Ajout 2 — Timeout SSH pour les migrations longues

Le step SSH de migration peut durer plusieurs minutes sur `whatsapp_message` (index covering).  
Le timeout par défaut d'`appleboy/ssh-action` est 30s. À augmenter pour ce déploiement :

```yaml
# Dans le step "Deploy via SSH (production)"
- name: Deploy via SSH (production)
  uses: appleboy/ssh-action@v1
  with:
    host:     ${{ secrets.PROD_SSH_HOST }}
    username: ${{ secrets.PROD_SSH_USER }}
    key:      ${{ secrets.PROD_SSH_KEY }}
    command_timeout: 30m   # ← augmenter pour les migrations longues
    script: |
      ...
```

---

### 12.5 Procédure de rollback dans le contexte CI/CD

#### Rollback code seul (pipeline automatique) — conditionnel

Si `docker compose up` échoue après `migration:run`, le pipeline restaure automatiquement  
l'image `:prod-previous` et relance les conteneurs. **La DB reste au schéma V2.**

Ce rollback code seul n'est **pas automatiquement safe** pour cette migration car certaines migrations ne sont pas additives (`remove_auto_message_legacy`, `drop_legacy_channel_credentials`). 

**Procédure obligatoire si le pipeline restaure l'image V1 :**
```
1. Vérifier immédiatement les logs V1 : docker logs whatsapp-back --tail=100
2. Lancer un smoke test V1 minimal (connexion + chargement conversations)
   → Si smoke V1 OK : toléré temporairement, corriger V2 et repush
   → Si smoke V1 KO (erreur sur messages_predefinis ou meta_app_id) : rollback DB obligatoire
3. Rollback DB si nécessaire : voir section "Rollback code + DB" ci-dessous
```

#### Rollback code + DB (manuel, si migration:run elle-même échoue)

```
1. Le pipeline s'arrête avec exit 1 sur migration:run
2. Les conteneurs V1 tournent toujours (non touchés car migration:run est avant docker compose up)
3. → L'application reste disponible en V1

4. Si la DB est partiellement migrée (migration:run s'est arrêtée en cours) :
   → Restaurer depuis le backup automatique créé à l'étape 12.4 Ajout 1
   → Sur le serveur :
     set -a && source /var/www/whatsapp/message_whatsapp/.env && set +a
     gunzip -c /var/backups/db_prod_YYYYMMDD_HHMMSS.sql.gz | docker exec -i whatsapp-db mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
     # docker exec -i : mysql s'exécute dans le container DB, pas sur le host
     # (fonctionne même si mysql n'est pas installé côté host ou si la DB n'écoute que dans Docker)
   → Les conteneurs V1 continuent de tourner sans interruption

5. Analyser l'erreur, corriger la migration, puis repush
```

> **Avantage du pipeline** : si `migration:run` échoue, les anciens conteneurs **n'ont pas été touchés**  
> (le `docker compose up` avec les nouvelles images n'a pas encore été lancé).  
> La production continue de tourner en V1 pendant que l'équipe analyse et corrige.

---

### 12.6 Vérification post-déploiement via les logs GitHub Actions

Après le push `production`, surveiller dans l'onglet **Actions** de GitHub :

```
deploy job → Deploy via SSH (production) → logs en temps réel

Points à vérifier :
  ✅ "migration:run" : toutes les migrations listées avec "success"
  ✅ Pas de ligne "Migration bloquée" ou "throw new Error"
  ✅ "docker compose up" : all containers started
  ✅ "DÉPLOIEMENT PRODUCTION RÉUSSI"
  ❌ "ROLLBACK TERMINÉ" → analyser les logs backend avant le rollback
```

---

## 13. Timeline

```
Semaine 1   Sprint B1 (core) sur branche feature/convergence-production
             → Porter les migrations production (section 6.2) dans master
             → Porter les modules backend P0 (B1-1 à B1-22)
             → Porter les correctifs C1..C10 + D1..D5
             → Objectif : compilation 0 erreur (tsc --noEmit) + next build sans erreur

Semaine 2   Sprint B1 (UI) + dry-run préliminaire
             → Porter les composants front/admin P0 (B1-7, B1-8, B1-21, B1-22)
             → Import DB production sur staging via phpMyAdmin
             → npm run migration:run sur staging (première fois — identifier les blocages)
             → verify_integrity.sql (19 checks) → corriger les écarts

Semaine 3   Corrections issues du dry-run
             → Vérifier le conflit AddWindowReminderSection + remove_auto_message_legacy
             → Sprint B2 (P1 : B2-1 à B2-6)
             → Merge feature/convergence-production → master (après review tester + reviewer)
             → Second dry-run sur staging propre → rapport livrable

Go-live     Fenêtre maintenance (45-60 min, prévoir 2h) + surveillance J+1
             → Volume migrations significativement plus important (26 nouvelles migrations)
               que la révision 7 — réévaluer la durée lors du dry-run
```

---

*Révision 8 — 2026-06-17. Audit exhaustif de toutes les migrations production non encore documentées.  
Ajouts section 3.4 : 4 nouvelles tables (commercial_conversation_access, meta_ad_referral, chat_session, quiz_*),  
26 colonnes et 4 groupes d'index non encore listés.  
Ajouts section 6.2 : 26 migrations production à porter dans master (OutboundHsm, ConnectionLog, ReadOnlyConfig,  
TrafficGrouping, ConversationRestrictionAccess, MessageReadTracking, IdleDisconnect, ConversationTurnTracking,  
CooldownAndWarning, FixUnreadCount, CleanupStaleLogs, MediaToAutoMessage, RestoreOrphanedSessions,  
LocalMediaStorage, MediaPanelToPoste, ProfilePicFetchedAt, QuizSystem, MetaAdReferral x3, ChatSessionEntity,  
WindowReminder x2, FixCollation, FixInstagramMessageId, WindowExpiresAt, BackfillWindowExpiresAt).  
Ajouts section 7 : 7 nouveaux checks d'intégrité (chat_session, meta_ad_referral, commercial_conversation_access,  
quiz, auto-message media, connexions orphelines, CTWA sans referral).  
Ajouts section 11 : 9 nouveaux modules P0 (B1-14 à B1-22), section 10.2c (5 correctifs UX), 2 modules P1  
supplémentaires (B2-5, B2-6), 13 entrées checklist non-régression supplémentaires.  
Timeline étendue à 3 semaines + go-live 45-60 min.*  
*Révision 7 — 2026-06-17. Ajouts : migration `BackfillWindowExpiresAt1781654400001`  
(section 3.4 + section 6), 2 checks d'intégrité `window_expires_at` (section 7), tableau des 10  
correctifs production à porter dans l'Axe B (section 10.2b) — correctifs fenêtre 24h, réactivation  
EN_ATTENTE, guard restriction backend, handler `restriction:check`, fix filtre `poste_id`, restauration  
état restriction au reconnect.*  
*Révision 6 — Corrections : ALTER TABLE whatsapp_template documentés, campaign_link_click sécurisé,  
CI/CD officiel section 12, maintenance avant push, backup Docker avec MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE,  
restauration via docker exec -i, rollback conditionnel.  
Analyse basée sur 156 commits production / 388 commits master depuis `c8e98a3`.*
