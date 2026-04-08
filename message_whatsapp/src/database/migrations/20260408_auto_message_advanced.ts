import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoMessageAdvanced1744070400000 implements MigrationInterface {
  name = 'AutoMessageAdvanced1744070400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. messages_predefinis — trigger_type, scope, client_type_target
    // ─────────────────────────────────────────────────────────────────────────

    if (!(await queryRunner.hasColumn('messages_predefinis', 'trigger_type'))) {
      await queryRunner.query(
        `ALTER TABLE \`messages_predefinis\`
         ADD COLUMN \`trigger_type\`
           ENUM('sequence','no_response','out_of_hours','reopened','queue_wait','keyword','client_type','inactivity','on_assign')
           NOT NULL DEFAULT 'sequence'`,
      );
    }

    if (!(await queryRunner.hasColumn('messages_predefinis', 'scope_type'))) {
      await queryRunner.query(
        `ALTER TABLE \`messages_predefinis\`
         ADD COLUMN \`scope_type\` ENUM('poste','canal') NULL DEFAULT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('messages_predefinis', 'scope_id'))) {
      await queryRunner.query(
        `ALTER TABLE \`messages_predefinis\`
         ADD COLUMN \`scope_id\` VARCHAR(100) NULL DEFAULT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('messages_predefinis', 'scope_label'))) {
      await queryRunner.query(
        `ALTER TABLE \`messages_predefinis\`
         ADD COLUMN \`scope_label\` VARCHAR(200) NULL DEFAULT NULL`,
      );
    }

    if (!(await queryRunner.hasColumn('messages_predefinis', 'client_type_target'))) {
      await queryRunner.query(
        `ALTER TABLE \`messages_predefinis\`
         ADD COLUMN \`client_type_target\` ENUM('new','returning','all') NULL DEFAULT 'all'`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. cron_config — seuils, filtres, plage horaire
    // ─────────────────────────────────────────────────────────────────────────

    const cronCols: Array<{ name: string; definition: string }> = [
      { name: 'no_response_threshold_minutes',  definition: 'INT NULL DEFAULT NULL' },
      { name: 'queue_wait_threshold_minutes',    definition: 'INT NULL DEFAULT NULL' },
      { name: 'inactivity_threshold_minutes',   definition: 'INT NULL DEFAULT NULL' },
      { name: 'apply_to_read_only',             definition: 'TINYINT(1) NULL DEFAULT 0' },
      { name: 'apply_to_closed',                definition: 'TINYINT(1) NULL DEFAULT 0' },
      { name: 'active_hour_start',              definition: 'INT NULL DEFAULT 5' },
      { name: 'active_hour_end',                definition: 'INT NULL DEFAULT 21' },
    ];

    for (const col of cronCols) {
      if (!(await queryRunner.hasColumn('cron_config', col.name))) {
        await queryRunner.query(
          `ALTER TABLE \`cron_config\` ADD COLUMN \`${col.name}\` ${col.definition}`,
        );
      }
    }

    // scheduleType enum : ajouter 'config' si absent
    await queryRunner.query(
      `ALTER TABLE \`cron_config\`
       MODIFY COLUMN \`schedule_type\`
         ENUM('interval','cron','event','config') NOT NULL`,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // 3. whatsapp_chat — champs de suivi par trigger
    // ─────────────────────────────────────────────────────────────────────────

    const chatCols: Array<{ name: string; definition: string }> = [
      // Trigger A — Sans réponse
      { name: 'no_response_auto_step',          definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'last_no_response_auto_sent_at',  definition: 'TIMESTAMP NULL DEFAULT NULL' },
      // Trigger C — Hors horaires
      { name: 'out_of_hours_auto_sent',         definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      // Trigger D — Réouverture
      { name: 'reopened_at',                    definition: 'TIMESTAMP NULL DEFAULT NULL' },
      { name: 'reopened_auto_sent',             definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      // Trigger E — Attente queue
      { name: 'queue_wait_auto_step',           definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'last_queue_wait_auto_sent_at',   definition: 'TIMESTAMP NULL DEFAULT NULL' },
      // Trigger F — Mot-clé
      { name: 'keyword_auto_sent_at',           definition: 'TIMESTAMP NULL DEFAULT NULL' },
      // Trigger G — Type client
      { name: 'client_type_auto_sent',          definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'is_known_client',                definition: 'TINYINT(1) NULL DEFAULT NULL' },
      // Trigger H — Inactivité
      { name: 'inactivity_auto_step',           definition: 'INT NOT NULL DEFAULT 0' },
      { name: 'last_inactivity_auto_sent_at',   definition: 'TIMESTAMP NULL DEFAULT NULL' },
      // Trigger I — Après assignation
      { name: 'on_assign_auto_sent',            definition: 'TINYINT(1) NOT NULL DEFAULT 0' },
    ];

    for (const col of chatCols) {
      if (!(await queryRunner.hasColumn('whatsapp_chat', col.name))) {
        await queryRunner.query(
          `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`${col.name}\` ${col.definition}`,
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Nouvelle table auto_message_keyword
    // ─────────────────────────────────────────────────────────────────────────

    const keywordTableExists = await queryRunner.hasTable('auto_message_keyword');
    if (!keywordTableExists) {
      // Récupérer le charset/collation de messages_predefinis pour être identique
      const [tableInfo] = await queryRunner.query(
        `SELECT CCSA.character_set_name, CCSA.collation_name
         FROM information_schema.TABLES T
         JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY CCSA
           ON CCSA.collation_name = T.TABLE_COLLATION
         WHERE T.TABLE_SCHEMA = DATABASE()
           AND T.TABLE_NAME = 'messages_predefinis'`,
      );
      const charset   = tableInfo?.character_set_name ?? 'utf8mb4';
      const collation = tableInfo?.collation_name      ?? 'utf8mb4_unicode_ci';

      // Récupérer le type exact de messages_predefinis.id
      const [colInfo] = await queryRunner.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'messages_predefinis'
           AND COLUMN_NAME  = 'id'`,
      );
      const idColType = colInfo?.COLUMN_TYPE ?? 'varchar(36)';

      await queryRunner.query(`
        CREATE TABLE \`auto_message_keyword\` (
          \`id\`              varchar(36)                           NOT NULL,
          \`keyword\`         varchar(100)                          NOT NULL,
          \`match_type\`      enum('exact','contains','starts_with') NOT NULL DEFAULT 'contains',
          \`case_sensitive\`  tinyint(1)                            NOT NULL DEFAULT 0,
          \`message_auto_id\` ${idColType}                          NOT NULL,
          \`actif\`           tinyint(1)                            NOT NULL DEFAULT 1,
          \`created_at\`      timestamp                             NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`      timestamp                             NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`IDX_auto_msg_keyword_message_auto\` (\`message_auto_id\`),
          CONSTRAINT \`FK_auto_msg_keyword_message_auto\`
            FOREIGN KEY (\`message_auto_id\`)
            REFERENCES \`messages_predefinis\` (\`id\`)
            ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
          DEFAULT CHARSET=${charset} COLLATE=${collation}
      `);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Nouvelle table business_hours_config
    // ─────────────────────────────────────────────────────────────────────────

    const bhTableExists = await queryRunner.hasTable('business_hours_config');
    if (!bhTableExists) {
      await queryRunner.query(`
        CREATE TABLE \`business_hours_config\` (
          \`id\`           varchar(36) NOT NULL,
          \`day_of_week\`  tinyint     NOT NULL COMMENT '0=Dimanche, 1=Lundi … 6=Samedi',
          \`open_hour\`    int         NOT NULL DEFAULT 8,
          \`open_minute\`  int         NOT NULL DEFAULT 0,
          \`close_hour\`   int         NOT NULL DEFAULT 18,
          \`close_minute\` int         NOT NULL DEFAULT 0,
          \`is_open\`      tinyint(1)  NOT NULL DEFAULT 1,
          \`created_at\`   timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`   timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_business_hours_day\` (\`day_of_week\`)
        ) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
          DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Données initiales : lun–ven ouverts 8h–18h, sam–dim fermés
      const defaultHours = [
        { day: 0, isOpen: 0, oh: 8, om: 0, ch: 18, cm: 0 }, // Dimanche — fermé
        { day: 1, isOpen: 1, oh: 8, om: 0, ch: 18, cm: 0 }, // Lundi
        { day: 2, isOpen: 1, oh: 8, om: 0, ch: 18, cm: 0 }, // Mardi
        { day: 3, isOpen: 1, oh: 8, om: 0, ch: 18, cm: 0 }, // Mercredi
        { day: 4, isOpen: 1, oh: 8, om: 0, ch: 18, cm: 0 }, // Jeudi
        { day: 5, isOpen: 1, oh: 8, om: 0, ch: 18, cm: 0 }, // Vendredi
        { day: 6, isOpen: 0, oh: 8, om: 0, ch: 18, cm: 0 }, // Samedi — fermé
      ];

      for (const h of defaultHours) {
        await queryRunner.query(
          `INSERT INTO \`business_hours_config\`
             (id, day_of_week, open_hour, open_minute, close_hour, close_minute, is_open)
           VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
          [h.day, h.oh, h.om, h.ch, h.cm, h.isOpen],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── 5. Drop business_hours_config ────────────────────────────────────────
    if (await queryRunner.hasTable('business_hours_config')) {
      await queryRunner.dropTable('business_hours_config', true);
    }

    // ── 4. Drop auto_message_keyword ─────────────────────────────────────────
    if (await queryRunner.hasTable('auto_message_keyword')) {
      await queryRunner.dropForeignKey('auto_message_keyword', 'FK_auto_msg_keyword_message_auto');
      await queryRunner.dropTable('auto_message_keyword', true);
    }

    // ── 3. whatsapp_chat — suppression des colonnes ──────────────────────────
    const chatColsToDrop = [
      'no_response_auto_step', 'last_no_response_auto_sent_at',
      'out_of_hours_auto_sent',
      'reopened_at', 'reopened_auto_sent',
      'queue_wait_auto_step', 'last_queue_wait_auto_sent_at',
      'keyword_auto_sent_at',
      'client_type_auto_sent', 'is_known_client',
      'inactivity_auto_step', 'last_inactivity_auto_sent_at',
      'on_assign_auto_sent',
    ];

    for (const col of chatColsToDrop) {
      if (await queryRunner.hasColumn('whatsapp_chat', col)) {
        await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`${col}\``);
      }
    }

    // ── 2. cron_config — suppression des colonnes ────────────────────────────
    const cronColsToDrop = [
      'no_response_threshold_minutes', 'queue_wait_threshold_minutes',
      'inactivity_threshold_minutes', 'apply_to_read_only', 'apply_to_closed',
      'active_hour_start', 'active_hour_end',
    ];

    for (const col of cronColsToDrop) {
      if (await queryRunner.hasColumn('cron_config', col)) {
        await queryRunner.query(`ALTER TABLE \`cron_config\` DROP COLUMN \`${col}\``);
      }
    }

    // Restaurer l'enum schedule_type sans 'config'
    await queryRunner.query(
      `ALTER TABLE \`cron_config\`
       MODIFY COLUMN \`schedule_type\`
         ENUM('interval','cron','event') NOT NULL`,
    );

    // ── 1. messages_predefinis — suppression des colonnes ────────────────────
    const msgColsToDrop = ['trigger_type', 'scope_type', 'scope_id', 'scope_label', 'client_type_target'];

    for (const col of msgColsToDrop) {
      if (await queryRunner.hasColumn('messages_predefinis', col)) {
        await queryRunner.query(`ALTER TABLE \`messages_predefinis\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
