import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminNotification1742601601000 implements MigrationInterface {
  name = 'CreateAdminNotification1742601601000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin_notification\` (
        \`id\`         CHAR(36)      NOT NULL,
        \`type\`       VARCHAR(20)   NOT NULL,
        \`title\`      VARCHAR(255)  NOT NULL,
        \`message\`    TEXT          NOT NULL,
        \`read\`       TINYINT(1)    NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`admin_notification\``);
  }
}
