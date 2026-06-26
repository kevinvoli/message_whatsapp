import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubGroupsAndBreaks1783000000002 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // 1. Table commercial_sub_group
    if (!(await qr.hasTable('commercial_sub_group'))) {
      await qr.query(`
        CREATE TABLE \`commercial_sub_group\` (
          \`id\`              CHAR(36)     NOT NULL,
          \`parent_group_id\` CHAR(36)     NOT NULL,
          \`name\`            VARCHAR(100) NOT NULL,
          \`description\`     VARCHAR(255) NULL,
          \`is_active\`       TINYINT(1)   NOT NULL DEFAULT 1,
          \`created_at\`      DATETIME     NOT NULL DEFAULT NOW(),
          \`updated_at\`      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
          \`deleted_at\`      DATETIME     NULL DEFAULT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_sub_group_name\` (\`parent_group_id\`, \`name\`),
          INDEX \`IDX_sub_group_parent\` (\`parent_group_id\`),
          CONSTRAINT \`FK_sub_group_parent\`
            FOREIGN KEY (\`parent_group_id\`) REFERENCES \`commercial_group\` (\`id\`)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 2. Table sub_group_break_schedule
    if (!(await qr.hasTable('sub_group_break_schedule'))) {
      await qr.query(`
        CREATE TABLE \`sub_group_break_schedule\` (
          \`id\`                         CHAR(36)      NOT NULL,
          \`sub_group_id\`               CHAR(36)      NOT NULL,
          \`start_time\`                 TIME          NOT NULL,
          \`end_time\`                   TIME          NOT NULL,
          \`reminder_interval_minutes\`  INT           NOT NULL DEFAULT 5,
          \`popup_message_text\`         VARCHAR(1000) NULL,
          \`popup_audio_asset_id\`       CHAR(36)      NULL,
          \`max_duration_minutes\`       INT           NOT NULL DEFAULT 60,
          \`created_at\`                 DATETIME      NOT NULL DEFAULT NOW(),
          \`updated_at\`                 DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
          \`deleted_at\`                 DATETIME      NULL DEFAULT NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_break_schedule_subgroup\` (\`sub_group_id\`),
          CONSTRAINT \`FK_break_schedule_subgroup\`
            FOREIGN KEY (\`sub_group_id\`) REFERENCES \`commercial_sub_group\` (\`id\`)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 3. Table break_exclusion
    if (!(await qr.hasTable('break_exclusion'))) {
      await qr.query(`
        CREATE TABLE \`break_exclusion\` (
          \`id\`             CHAR(36)                     NOT NULL,
          \`sub_group_id\`   CHAR(36)                     NOT NULL,
          \`scope\`          ENUM('poste','commercial')   NOT NULL,
          \`poste_id\`       CHAR(36)                     NULL,
          \`commercial_id\`  CHAR(36)                     NULL,
          \`created_at\`     DATETIME                     NOT NULL DEFAULT NOW(),
          \`deleted_at\`     DATETIME                     NULL DEFAULT NULL,
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_exclusion_subgroup\` (\`sub_group_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 4. Table break_session
    if (!(await qr.hasTable('break_session'))) {
      await qr.query(`
        CREATE TABLE \`break_session\` (
          \`id\`                 CHAR(36)                    NOT NULL,
          \`commercial_id\`      CHAR(36)                    NOT NULL,
          \`break_schedule_id\`  CHAR(36)                    NOT NULL,
          \`date\`               DATE                        NOT NULL,
          \`taken_at\`           DATETIME                    NULL,
          \`status\`             ENUM('taken','missed')      NOT NULL DEFAULT 'taken',
          \`created_at\`         DATETIME                    NOT NULL DEFAULT NOW(),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_break_session\` (\`commercial_id\`, \`break_schedule_id\`, \`date\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 5. Colonne sub_group_id sur whatsapp_commercial (sans FK DB pour compatibilité collation)
    if (!(await qr.hasColumn('whatsapp_commercial', 'sub_group_id'))) {
      await qr.query(`
        ALTER TABLE \`whatsapp_commercial\`
          ADD COLUMN \`sub_group_id\` VARCHAR(36) NULL DEFAULT NULL,
          ADD INDEX \`IDX_commercial_sub_group_id\` (\`sub_group_id\`)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasColumn('whatsapp_commercial', 'sub_group_id')) {
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP INDEX \`IDX_commercial_sub_group_id\``);
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`sub_group_id\``);
    }
    await qr.query(`DROP TABLE IF EXISTS \`break_session\``);
    await qr.query(`DROP TABLE IF EXISTS \`break_exclusion\``);
    await qr.query(`DROP TABLE IF EXISTS \`sub_group_break_schedule\``);
    await qr.query(`DROP TABLE IF EXISTS \`commercial_sub_group\``);
  }
}
