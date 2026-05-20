import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCollations1747699200002 implements MigrationInterface {
  name = 'FixCollations1747699200002';

  async up(qr: QueryRunner): Promise<void> {
    // Normalise les collations vers utf8mb4_unicode_ci pour éviter
    // ER_CANT_AGGREGATE_2COLLATIONS (errno 1267) sur les JOINs inter-tables
    await qr.query(`ALTER TABLE \`whatsapp_commercial\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await qr.query(`ALTER TABLE \`whatsapp_poste\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await qr.query(`ALTER TABLE \`commercial_group\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await qr.query(`ALTER TABLE \`commercial_planning\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await qr.query(`ALTER TABLE \`group_schedule_day\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Pas de rollback : revenir à general_ci recréerait le bug
  }
}
