import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialGroupFoundations1783000000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // 1. Table commercial_group
    if (!(await qr.hasTable('commercial_group'))) {
      await qr.query(`
        CREATE TABLE \`commercial_group\` (
          \`id\`              CHAR(36)     NOT NULL,
          \`name\`            VARCHAR(100) NOT NULL,
          \`description\`     VARCHAR(255) NULL,
          \`is_active\`       TINYINT(1)   NOT NULL DEFAULT 1,
          \`work_days_count\` INT          NOT NULL DEFAULT 2,
          \`first_work_day\`  DATE         NULL DEFAULT NULL,
          \`created_at\`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_commercial_group_name\` (\`name\`),
          INDEX \`IDX_commercial_group_active\` (\`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      if (!(await qr.hasColumn('commercial_group', 'work_days_count'))) {
        await qr.query(`ALTER TABLE \`commercial_group\` ADD COLUMN \`work_days_count\` INT NOT NULL DEFAULT 2`);
      }
      if (!(await qr.hasColumn('commercial_group', 'first_work_day'))) {
        await qr.query(`ALTER TABLE \`commercial_group\` ADD COLUMN \`first_work_day\` DATE NULL DEFAULT NULL`);
      }
    }

    // 2. Colonnes whatsapp_commercial
    if (!(await qr.hasColumn('whatsapp_commercial', 'group_id'))) {
      await qr.query(`
        ALTER TABLE \`whatsapp_commercial\`
          ADD COLUMN \`group_id\` VARCHAR(36) NULL DEFAULT NULL,
          ADD INDEX  \`IDX_commercial_group_id\` (\`group_id\`)
      `);
    }
    if (!(await qr.hasColumn('whatsapp_commercial', 'is_working_today'))) {
      await qr.query(`
        ALTER TABLE \`whatsapp_commercial\`
          ADD COLUMN \`is_working_today\`    TINYINT(1) NOT NULL DEFAULT 0,
          ADD COLUMN \`working_today_since\` TIMESTAMP  NULL DEFAULT NULL,
          ADD INDEX  \`IDX_commercial_working_today\` (\`is_working_today\`)
      `);
    }

    // 3. Table group_schedule_day
    if (!(await qr.hasTable('group_schedule_day'))) {
      await qr.query(`
        CREATE TABLE \`group_schedule_day\` (
          \`id\`          CHAR(36)   NOT NULL,
          \`group_id\`    CHAR(36)   NOT NULL,
          \`date\`        DATE       NOT NULL,
          \`is_work_day\` TINYINT(1) NOT NULL DEFAULT 0,
          \`created_at\`  TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_group_schedule_day\` (\`group_id\`, \`date\`),
          INDEX \`IDX_group_schedule_date\`  (\`date\`),
          INDEX \`IDX_group_schedule_group\` (\`group_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // 4. Table commercial_planning
    if (!(await qr.hasTable('commercial_planning'))) {
      await qr.query(`
        CREATE TABLE \`commercial_planning\` (
          \`id\`                   VARCHAR(36)                               NOT NULL,
          \`commercial_id\`        VARCHAR(36)                               NOT NULL,
          \`type\`                 ENUM('absence','exceptional')             NOT NULL,
          \`time_slot\`            ENUM('full','morning','afternoon')        NOT NULL DEFAULT 'full',
          \`date\`                 DATE                                      NOT NULL,
          \`linked_commercial_id\` VARCHAR(36)                               NULL,
          \`override_poste_id\`    VARCHAR(36)                               NULL,
          \`reason\`               VARCHAR(255)                              NULL,
          \`declared_by\`          VARCHAR(100)                              NULL,
          \`created_at\`           DATETIME                                  NOT NULL DEFAULT NOW(),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_commercial_planning_date\`     (\`commercial_id\`, \`date\`),
          INDEX \`IDX_commercial_planning_date\`         (\`date\`),
          INDEX \`IDX_commercial_planning_type_date\`    (\`type\`, \`date\`),
          INDEX \`IDX_commercial_planning_commercial\`   (\`commercial_id\`),
          INDEX \`IDX_commercial_planning_linked\`       (\`linked_commercial_id\`),
          INDEX \`IDX_commercial_planning_poste\`        (\`override_poste_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } else {
      if (!(await qr.hasColumn('commercial_planning', 'time_slot'))) {
        await qr.query(`
          ALTER TABLE \`commercial_planning\`
            ADD COLUMN \`time_slot\` ENUM('full','morning','afternoon') NOT NULL DEFAULT 'full'
        `);
      }
    }

    // 5. Table commercial_planning_audit
    if (!(await qr.hasTable('commercial_planning_audit'))) {
      await qr.query(`
        CREATE TABLE \`commercial_planning_audit\` (
          \`id\`             VARCHAR(36)                      NOT NULL,
          \`planning_id\`    VARCHAR(36)                      NULL,
          \`action\`         ENUM('created','deleted')        NOT NULL,
          \`commercial_id\`  VARCHAR(36)                      NOT NULL,
          \`type\`           ENUM('absence','exceptional')    NOT NULL,
          \`date\`           DATE                             NOT NULL,
          \`reason\`         VARCHAR(255)                     NULL,
          \`declared_by\`    VARCHAR(100)                     NULL,
          \`performed_at\`   DATETIME                         NOT NULL DEFAULT NOW(),
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_planning_audit_commercial\` (\`commercial_id\`),
          INDEX \`IDX_planning_audit_date\`       (\`date\`),
          INDEX \`IDX_planning_audit_performed\`  (\`performed_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('commercial_planning_audit')) {
      await qr.query(`DROP TABLE IF EXISTS \`commercial_planning_audit\``);
    }
    if (await qr.hasTable('commercial_planning')) {
      await qr.query(`DROP TABLE IF EXISTS \`commercial_planning\``);
    }
    if (await qr.hasTable('group_schedule_day')) {
      await qr.query(`DROP TABLE IF EXISTS \`group_schedule_day\``);
    }
    if (await qr.hasColumn('whatsapp_commercial', 'is_working_today')) {
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP INDEX IF EXISTS \`IDX_commercial_working_today\``);
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`working_today_since\``);
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`is_working_today\``);
    }
    if (await qr.hasColumn('whatsapp_commercial', 'group_id')) {
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP INDEX IF EXISTS \`IDX_commercial_group_id\``);
      await qr.query(`ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`group_id\``);
    }
    if (await qr.hasTable('commercial_group')) {
      await qr.query(`DROP TABLE IF EXISTS \`commercial_group\``);
    }
  }
}
