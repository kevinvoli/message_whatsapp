import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration de synchronisation complète — 2026-03-21
 * Reflète l'ensemble des entités TypeORM actuelles.
 * Utilise CREATE TABLE IF NOT EXISTS + ajout conditionnel de colonnes
 * pour être idempotente (safe à rejouer sur n'importe quel état de DB).
 */
export class SyncAllEntities1742601700000 implements MigrationInterface {
  name = 'SyncAllEntities1742601700000';

  // ─── Helper ────────────────────────────────────────────────────────────────

  private async columnExists(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const [row] = (await qr.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = ?
         AND COLUMN_NAME  = ?`,
      [table, column],
    )) as Array<{ cnt: number }>;
    return Number(row.cnt) > 0;
  }

  private async addCol(
    qr: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    if (!(await this.columnExists(qr, table, column))) {
      await qr.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      );
    }
  }

  // ─── UP ────────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── 1. admin ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin\` (
        \`id\`         CHAR(36)     NOT NULL,
        \`email\`      VARCHAR(255) NOT NULL,
        \`name\`       VARCHAR(255) NOT NULL,
        \`password\`   VARCHAR(255) NOT NULL,
        \`salt\`       VARCHAR(255) NULL,
        \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_admin_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. whatsapp_poste ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_poste\` (
        \`id\`               CHAR(36)     NOT NULL,
        \`code\`             VARCHAR(100) NOT NULL,
        \`is_active\`        TINYINT(1)   NOT NULL DEFAULT 1,
        \`is_queue_enabled\` TINYINT(1)   NOT NULL DEFAULT 1,
        \`name\`             VARCHAR(100) NOT NULL,
        \`created_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_poste_code\` (\`code\`),
        UNIQUE KEY \`UQ_whatsapp_poste_name\` (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. whatsapp_commercial ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_commercial\` (
        \`id\`                   CHAR(36)     NOT NULL,
        \`email\`                VARCHAR(255) NULL,
        \`name\`                 VARCHAR(255) NOT NULL,
        \`password\`             VARCHAR(255) NOT NULL,
        \`poste_id\`             CHAR(36)     NULL,
        \`passwordResetToken\`   VARCHAR(255) NULL,
        \`passwordResetExpires\` TIMESTAMP    NULL,
        \`isConnected\`          TINYINT(1)   NOT NULL DEFAULT 0,
        \`lastConnectionAt\`     TIMESTAMP    NULL,
        \`salt\`                 VARCHAR(255) NOT NULL DEFAULT '1232',
        \`created_at\`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\`           TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_commercial_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 4. channels (ProviderChannel) ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`channels\` (
        \`id\`          CHAR(36)     NOT NULL,
        \`tenant_id\`   CHAR(36)     NOT NULL,
        \`provider\`    VARCHAR(32)  NOT NULL,
        \`external_id\` VARCHAR(191) NOT NULL,
        \`channel_id\`  VARCHAR(191) NULL,
        \`status\`      VARCHAR(32)  NULL,
        \`created_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_channels_provider_external_id\` (\`provider\`, \`external_id\`),
        KEY \`IDX_channels_tenant_provider_external\` (\`tenant_id\`, \`provider\`, \`external_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 5. contact ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contact\` (
        \`id\`                CHAR(36)     NOT NULL,
        \`name\`              VARCHAR(100) NOT NULL,
        \`contact\`           VARCHAR(100) NOT NULL,
        \`chat_id\`           VARCHAR(100) NULL,
        \`call_status\`       ENUM('à_appeler','appelé','rappeler','non_joignable') NOT NULL DEFAULT 'à_appeler',
        \`last_call_date\`    TIMESTAMP    NULL,
        \`last_call_outcome\` VARCHAR(255) NULL,
        \`next_call_date\`    TIMESTAMP    NULL,
        \`call_count\`        INT          NOT NULL DEFAULT 0,
        \`call_notes\`        TEXT         NULL,
        \`total_messages\`    INT          NOT NULL DEFAULT 0,
        \`last_message_date\` TIMESTAMP    NULL,
        \`conversion_status\` ENUM('nouveau','prospect','client','perdu') NOT NULL DEFAULT 'nouveau',
        \`source\`            VARCHAR(100) NULL,
        \`priority\`          ENUM('haute','moyenne','basse') NULL,
        \`is_active\`         TINYINT(1)   NOT NULL DEFAULT 1,
        \`createdAt\`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`         TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 6. whatsapp_chat ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_chat\` (
        \`id\`                        CHAR(36)     NOT NULL,
        \`tenant_id\`                 CHAR(36)     NULL,
        \`poste_id\`                  VARCHAR(100) NULL,
        \`last_msg_client_channel_id\` VARCHAR(100) NULL,
        \`channel_id\`                VARCHAR(100) NULL,
        \`assigned_at\`               TIMESTAMP    NULL,
        \`assigned_mode\`             ENUM('ONLINE','OFFLINE') NULL,
        \`first_response_deadline_at\` TIMESTAMP   NULL,
        \`last_client_message_at\`    TIMESTAMP    NULL,
        \`last_poste_message_at\`     TIMESTAMP    NULL,
        \`chat_id\`                   VARCHAR(100) NOT NULL,
        \`name\`                      VARCHAR(100) NOT NULL,
        \`status\`                    ENUM('actif','en attente','fermé') NOT NULL DEFAULT 'en attente',
        \`type\`                      VARCHAR(100) NOT NULL,
        \`chat_pic\`                  VARCHAR(100) NOT NULL DEFAULT 'default.png',
        \`chat_pic_full\`             VARCHAR(100) NOT NULL DEFAULT 'default.png',
        \`is_pinned\`                 TINYINT(1)   NOT NULL DEFAULT 0,
        \`is_muted\`                  TINYINT(1)   NOT NULL DEFAULT 0,
        \`mute_until\`                TIMESTAMP    NULL,
        \`is_archived\`               TINYINT(1)   NOT NULL DEFAULT 0,
        \`unread_count\`              INT          NOT NULL DEFAULT 0,
        \`unread_mention\`            TINYINT(1)   NOT NULL DEFAULT 0,
        \`read_only\`                 TINYINT(1)   NOT NULL DEFAULT 0,
        \`not_spam\`                  TINYINT(1)   NOT NULL DEFAULT 1,
        \`last_activity_at\`          TIMESTAMP    NULL,
        \`contact_client\`            VARCHAR(100) NOT NULL,
        \`auto_message_id\`           VARCHAR(100) NULL,
        \`current_auto_message_id\`   VARCHAR(100) NULL,
        \`auto_message_status\`       VARCHAR(100) NULL,
        \`auto_message_step\`         INT          NOT NULL DEFAULT 0,
        \`waiting_client_reply\`      TINYINT(1)   NOT NULL DEFAULT 0,
        \`last_auto_message_sent_at\` TIMESTAMP    NULL,
        \`createdAt\`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`                 TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_whatsapp_chat_tenant_id\` (\`tenant_id\`),
        UNIQUE KEY \`UQ_whatsapp_chat_tenant_chat_id\` (\`tenant_id\`, \`chat_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 7. whatsapp_message ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_message\` (
        \`id\`                  CHAR(36)     NOT NULL,
        \`tenant_id\`           CHAR(36)     NULL,
        \`provider\`            VARCHAR(32)  NULL,
        \`provider_message_id\` VARCHAR(191) NULL,
        \`message_id\`          VARCHAR(100) NULL,
        \`external_id\`         VARCHAR(100) NULL,
        \`chat_id\`             VARCHAR(100) NOT NULL,
        \`channel_id\`          VARCHAR(100) NOT NULL,
        \`type\`                VARCHAR(100) NOT NULL DEFAULT 'text',
        \`poste_id\`            VARCHAR(100) NULL,
        \`texte\`               LONGTEXT     NULL,
        \`contact_id\`          CHAR(36)     NULL,
        \`direction\`           ENUM('IN','OUT') NOT NULL,
        \`from_me\`             TINYINT(1)   NOT NULL,
        \`sender_phone\`        VARCHAR(100) NOT NULL,
        \`sender_name\`         VARCHAR(100) NOT NULL,
        \`timestamp\`           TIMESTAMP    NOT NULL,
        \`status\`              ENUM('failed','pending','sent','delivered','read','played','deleted') NOT NULL DEFAULT 'delivered',
        \`source\`              VARCHAR(100) NOT NULL,
        \`error_code\`          INT          NULL,
        \`error_title\`         VARCHAR(255) NULL,
        \`commercial_id\`       CHAR(36)     NULL,
        \`quoted_message_id\`   CHAR(36)     NULL,
        \`createdAt\`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`           TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_whatsapp_message_tenant_id\` (\`tenant_id\`),
        UNIQUE KEY \`UQ_whatsapp_message_tenant_provider_msg_direction\`
          (\`tenant_id\`, \`provider\`, \`provider_message_id\`, \`direction\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 8. whatsapp_message_content ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_message_content\` (
        \`id\`                 CHAR(36)     NOT NULL,
        \`message_content_id\` VARCHAR(100) NOT NULL,
        \`message_id\`         VARCHAR(100) NOT NULL,
        \`content_type\`       VARCHAR(100) NOT NULL,
        \`createdAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`          TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_message_content_message_content_id\` (\`message_content_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 9. whatsapp_media ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_media\` (
        \`id\`                 CHAR(36)      NOT NULL,
        \`tenant_id\`          CHAR(36)      NULL,
        \`provider\`           VARCHAR(32)   NULL,
        \`provider_media_id\`  VARCHAR(191)  NULL,
        \`media_id\`           VARCHAR(100)  NOT NULL,
        \`message_content_id\` VARCHAR(100)  NULL,
        \`media_type\`         VARCHAR(100)  NOT NULL,
        \`whapi_media_id\`     VARCHAR(100)  NOT NULL,
        \`url\`                TEXT          NULL,
        \`mime_type\`          VARCHAR(100)  NOT NULL,
        \`file_name\`          VARCHAR(100)  NULL,
        \`file_size\`          VARCHAR(100)  NULL,
        \`sha256\`             VARCHAR(100)  NULL,
        \`width\`              VARCHAR(100)  NULL,
        \`height\`             VARCHAR(100)  NULL,
        \`caption\`            VARCHAR(255)  NULL,
        \`preview\`            VARCHAR(255)  NULL,
        \`view_once\`          VARCHAR(100)  NOT NULL,
        \`duration_seconds\`   INT           NULL,
        \`latitude\`           DECIMAL(10,7) NULL,
        \`longitude\`          DECIMAL(10,7) NULL,
        \`message_id\`         CHAR(36)      NULL,
        \`chat_id\`            CHAR(36)      NULL,
        \`channel_id\`         CHAR(36)      NULL,
        \`createdAt\`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`          TIMESTAMP     NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_media_media_id\` (\`media_id\`),
        KEY \`IDX_whatsapp_media_tenant_id\` (\`tenant_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 10. whatsapp_chat_label ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_chat_label\` (
        \`id\`               CHAR(36)     NOT NULL,
        \`chat_label_id\`    VARCHAR(100) NOT NULL,
        \`chat_id\`          VARCHAR(100) NOT NULL,
        \`label_external_id\` VARCHAR(100) NULL,
        \`name\`             VARCHAR(100) NOT NULL,
        \`color\`            VARCHAR(100) NOT NULL,
        \`count\`            VARCHAR(100) NOT NULL,
        \`createdAt\`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`        TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_chat_label_chat_label_id\` (\`chat_label_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 11. whatsapp_contact ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`whatsapp_contact\` (
        \`id\`                 CHAR(36)     NOT NULL,
        \`contact_id\`         VARCHAR(100) NOT NULL,
        \`message_content_id\` VARCHAR(100) NOT NULL,
        \`name\`               VARCHAR(100) NOT NULL,
        \`vcard\`              VARCHAR(100) NOT NULL,
        \`createdAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deletedAt\`          TIMESTAMP    NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_whatsapp_contact_contact_id\` (\`contact_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 12. dispatch_settings ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dispatch_settings\` (
        \`id\`                                  CHAR(36)     NOT NULL,
        \`no_reply_reinject_interval_minutes\`  INT          NOT NULL DEFAULT 5,
        \`read_only_check_interval_minutes\`    INT          NOT NULL DEFAULT 10,
        \`offline_reinject_cron\`               VARCHAR(100) NOT NULL DEFAULT '0 9 * * *',
        \`auto_message_enabled\`                TINYINT(1)   NOT NULL DEFAULT 0,
        \`auto_message_delay_min_seconds\`      INT          NOT NULL DEFAULT 20,
        \`auto_message_delay_max_seconds\`      INT          NOT NULL DEFAULT 45,
        \`auto_message_max_steps\`              INT          NOT NULL DEFAULT 3,
        \`created_at\`                          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`                          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 13. dispatch_settings_audit ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dispatch_settings_audit\` (
        \`id\`          CHAR(36)  NOT NULL,
        \`settings_id\` CHAR(36)  NOT NULL,
        \`payload\`     LONGTEXT  NOT NULL,
        \`created_at\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 14. queue_positions ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`queue_positions\` (
        \`id\`       CHAR(36) NOT NULL,
        \`poste_id\` CHAR(36) NOT NULL,
        \`position\` INT      NOT NULL,
        \`added_at\`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 15. messages_predefinis ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`messages_predefinis\` (
        \`id\`         CHAR(36)  NOT NULL,
        \`body\`       TEXT      NOT NULL,
        \`delai\`      INT       NULL DEFAULT 0,
        \`canal\`      ENUM('whatsapp','sms','email') NULL DEFAULT 'whatsapp',
        \`position\`   INT       NOT NULL,
        \`actif\`      TINYINT(1) NOT NULL DEFAULT 1,
        \`conditions\` LONGTEXT  NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 16. auto_message_scope_config ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`auto_message_scope_config\` (
        \`id\`         CHAR(36)     NOT NULL,
        \`scope_type\` ENUM('poste','canal','provider') NOT NULL,
        \`scope_id\`   VARCHAR(100) NOT NULL,
        \`label\`      VARCHAR(200) NULL,
        \`enabled\`    TINYINT(1)   NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_auto_message_scope\` (\`scope_type\`, \`scope_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 17. cron_config ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`cron_config\` (
        \`id\`                CHAR(36)     NOT NULL,
        \`key\`               VARCHAR(100) NOT NULL,
        \`label\`             VARCHAR(200) NOT NULL,
        \`description\`       TEXT         NULL,
        \`enabled\`           TINYINT(1)   NOT NULL DEFAULT 1,
        \`schedule_type\`     ENUM('interval','cron','event') NOT NULL,
        \`interval_minutes\`  INT          NULL,
        \`cron_expression\`   VARCHAR(100) NULL,
        \`ttl_days\`          INT          NULL,
        \`delay_min_seconds\` INT          NULL,
        \`delay_max_seconds\` INT          NULL,
        \`max_steps\`         INT          NULL,
        \`last_run_at\`       DATETIME     NULL,
        \`created_at\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_cron_config_key\` (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 18. system_configs ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`system_configs\` (
        \`id\`           CHAR(36)     NOT NULL,
        \`config_key\`   VARCHAR(100) NOT NULL,
        \`config_value\` TEXT         NULL,
        \`category\`     VARCHAR(50)  NOT NULL DEFAULT 'general',
        \`label\`        VARCHAR(200) NULL,
        \`description\`  TEXT         NULL,
        \`is_secret\`    TINYINT(1)   NOT NULL DEFAULT 0,
        \`is_readonly\`  TINYINT(1)   NOT NULL DEFAULT 0,
        \`created_at\`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_system_config_key\` (\`config_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 19. webhook_event_log ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`webhook_event_log\` (
        \`id\`                  CHAR(36)     NOT NULL,
        \`tenant_id\`           CHAR(36)     NULL,
        \`provider\`            VARCHAR(32)  NOT NULL,
        \`event_key\`           VARCHAR(191) NOT NULL,
        \`event_type\`          VARCHAR(64)  NULL,
        \`direction\`           VARCHAR(8)   NULL,
        \`provider_message_id\` VARCHAR(191) NULL,
        \`payload_hash\`        VARCHAR(64)  NULL,
        \`createdAt\`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_webhook_event_log_tenant_provider_event_key\`
          (\`tenant_id\`, \`provider\`, \`event_key\`),
        KEY \`IDX_webhook_event_log_tenant_id\` (\`tenant_id\`)
      ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 20. admin_notification ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin_notification\` (
        \`id\`         CHAR(36)     NOT NULL,
        \`type\`       VARCHAR(20)  NOT NULL,
        \`title\`      VARCHAR(255) NOT NULL,
        \`message\`    TEXT         NOT NULL,
        \`read\`       TINYINT(1)   NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 21. call_log ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`call_log\` (
        \`id\`              CHAR(36)     NOT NULL,
        \`contact_id\`      VARCHAR(36)  NOT NULL,
        \`commercial_id\`   VARCHAR(36)  NOT NULL,
        \`commercial_name\` VARCHAR(200) NOT NULL,
        \`called_at\`       TIMESTAMP    NOT NULL,
        \`call_status\`     ENUM('à_appeler','appelé','rappeler','non_joignable') NOT NULL,
        \`outcome\`         ENUM('répondu','messagerie','pas_de_réponse','occupé') NULL,
        \`duration_sec\`    INT          NULL,
        \`notes\`           TEXT         NULL,
        \`createdAt\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 22. whapi_channels — colonnes manquantes ──────────────────────────────
    await this.addCol(qr, 'whapi_channels', 'label',
      `VARCHAR(100) NULL DEFAULT NULL AFTER \`tenant_id\``);
    await this.addCol(qr, 'whapi_channels', 'provider',
      `VARCHAR(32) NULL DEFAULT NULL AFTER \`label\``);
    await this.addCol(qr, 'whapi_channels', 'external_id',
      `VARCHAR(191) NULL DEFAULT NULL AFTER \`provider\``);
    await this.addCol(qr, 'whapi_channels', 'meta_app_id',
      `VARCHAR(64) NULL DEFAULT NULL AFTER \`token\``);
    await this.addCol(qr, 'whapi_channels', 'meta_app_secret',
      `VARCHAR(128) NULL DEFAULT NULL AFTER \`meta_app_id\``);
    await this.addCol(qr, 'whapi_channels', 'token_expires_at',
      `DATETIME NULL DEFAULT NULL`);

    // ── 23. whatsapp_message — colonnes multi-tenant ──────────────────────────
    await this.addCol(qr, 'whatsapp_message', 'tenant_id',
      `CHAR(36) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_message', 'provider',
      `VARCHAR(32) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_message', 'provider_message_id',
      `VARCHAR(191) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_message', 'error_code',
      `INT NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_message', 'error_title',
      `VARCHAR(255) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_message', 'quoted_message_id',
      `CHAR(36) NULL DEFAULT NULL`);

    // ── 24. whatsapp_chat — colonnes multi-tenant & dispatch ──────────────────
    await this.addCol(qr, 'whatsapp_chat', 'tenant_id',
      `CHAR(36) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_chat', 'last_msg_client_channel_id',
      `VARCHAR(100) NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_chat', 'assigned_mode',
      `ENUM('ONLINE','OFFLINE') NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_chat', 'auto_message_step',
      `INT NOT NULL DEFAULT 0`);
    await this.addCol(qr, 'whatsapp_chat', 'waiting_client_reply',
      `TINYINT(1) NOT NULL DEFAULT 0`);
    await this.addCol(qr, 'whatsapp_chat', 'last_auto_message_sent_at',
      `TIMESTAMP NULL DEFAULT NULL`);
    await this.addCol(qr, 'whatsapp_chat', 'current_auto_message_id',
      `VARCHAR(100) NULL DEFAULT NULL`);
  }

  // ─── DOWN ──────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Suppression dans l'ordre inverse (dépendances d'abord)
    for (const table of [
      'call_log',
      'admin_notification',
      'webhook_event_log',
      'system_configs',
      'cron_config',
      'auto_message_scope_config',
      'messages_predefinis',
      'queue_positions',
      'dispatch_settings_audit',
      'dispatch_settings',
      'whatsapp_contact',
      'whatsapp_chat_label',
      'whatsapp_media',
      'whatsapp_message_content',
      'whatsapp_message',
      'whatsapp_chat',
      'contact',
      'channels',
      'whatsapp_commercial',
      'whatsapp_poste',
      'admin',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
