import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformSettingTable1778180000001 implements MigrationInterface {
  name = 'AddPlatformSettingTable1778180000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('platform_setting');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`platform_setting\` (
          \`key\` VARCHAR(100) NOT NULL,
          \`value\` TEXT NULL,
          \`updated_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    await queryRunner.query(`
      INSERT IGNORE INTO \`platform_setting\` (\`key\`, \`value\`)
      VALUES ('auto_relance_enabled', 'false')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`platform_setting\``);
  }
}
