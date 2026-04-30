import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedLoginHours1777507260000 implements MigrationInterface {
  name = 'SeedLoginHours1777507260000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT IGNORE INTO \`system_configs\`
        (id, config_key, config_value, category, label, description, is_secret, is_readonly, created_at, updated_at)
      VALUES
        (UUID(), 'LOGIN_HOUR_START', '5',  'access', 'Heure de début des connexions', 'Heure (0–23) à partir de laquelle les commerciaux peuvent se connecter', 0, 0, NOW(), NOW()),
        (UUID(), 'LOGIN_HOUR_END',   '21', 'access', 'Heure de fin des connexions',   'Heure (0–23) après laquelle les connexions sont bloquées', 0, 0, NOW(), NOW())
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM \`system_configs\` WHERE \`config_key\` IN ('LOGIN_HOUR_START', 'LOGIN_HOUR_END')`,
    );
  }
}
