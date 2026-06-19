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
    const hasQueueMode = await queryRunner.hasColumn(ds, 'queue_mode');
    if (hasQueueMode) {
      await queryRunner.query(
        `UPDATE \`${ds}\` SET \`dispatch_mode\` = UPPER(\`queue_mode\`) WHERE \`queue_mode\` IS NOT NULL`,
      );
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

    if (!(await queryRunner.hasColumn(msg, 'hour_of_day')))
      await queryRunner.query(
        `ALTER TABLE \`${msg}\` ADD COLUMN \`hour_of_day\` TINYINT UNSIGNED GENERATED ALWAYS AS (HOUR(\`createdAt\`)) VIRTUAL`,
      );

    if (!(await queryRunner.hasColumn(msg, 'day_of_week_n')))
      await queryRunner.query(
        `ALTER TABLE \`${msg}\` ADD COLUMN \`day_of_week_n\` TINYINT UNSIGNED GENERATED ALWAYS AS (WEEKDAY(\`createdAt\`)) VIRTUAL`,
      );

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

    // Vérification schéma tables potentiellement importées depuis production
    await this.assertColumn(queryRunner, 'messaging_connection_log', 'user_type',
      `table messaging_connection_log : colonne user_type manquante ou schéma incompatible`);
    await this.assertColumn(queryRunner, 'media_asset', 'media_type',
      `table media_asset : colonne media_type manquante`);
    await this.assertColumn(queryRunner, 'campaign_link', 'short_code',
      `table campaign_link : colonne short_code manquante`);

    if (await queryRunner.hasTable('campaign_link_click')) {
      await this.assertColumn(queryRunner, 'campaign_link_click', 'campaign_link_id',
        `table campaign_link_click : colonne campaign_link_id manquante`);
      await this.assertColumn(queryRunner, 'campaign_link_click', 'clicked_at',
        `table campaign_link_click : colonne clicked_at manquante`);

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

      const fkExists: { cnt: string }[] = await queryRunner.query(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'campaign_link_click'
          AND CONSTRAINT_NAME = 'FK_click_campaign_link'
      `);
      if (parseInt(fkExists[0].cnt, 10) === 0) {
        try {
          // Normalise les collations des deux tables avant d'ajouter la FK
          // (errno 150 si campaign_link vient de production avec utf8mb4_general_ci)
          await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
          await queryRunner.query('ALTER TABLE `campaign_link` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
          await queryRunner.query('ALTER TABLE `campaign_link_click` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
          await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
          await queryRunner.query(`
            ALTER TABLE \`campaign_link_click\`
              ADD CONSTRAINT \`FK_click_campaign_link\`
                FOREIGN KEY (\`campaign_link_id\`) REFERENCES \`campaign_link\` (\`id\`) ON DELETE CASCADE
          `);
        } catch (e: any) {
          await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
          console.warn('[ConvergenceProductionToMasterV2] FK_click_campaign_link ignorée :', e.message);
        }
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
    // ⚠️ NE JAMAIS exécuter migration:revert sur la DB production.
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
