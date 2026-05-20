import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCollations1747699200002 implements MigrationInterface {
  name = 'FixCollations1747699200002';

  async up(qr: QueryRunner): Promise<void> {
    // Les tables existantes (whatsapp_commercial, whatsapp_poste, etc.) utilisent utf8mb4_general_ci.
    // Nos nouvelles tables ont été créées avec utf8mb4_unicode_ci.
    // On normalise les nouvelles tables vers utf8mb4_general_ci pour que les JOINs fonctionnent
    // sans ER_CANT_AGGREGATE_2COLLATIONS (errno 1267).
    // SET FOREIGN_KEY_CHECKS=0 nécessaire car commercial_group est référencé par whatsapp_commercial.group_id.
    await qr.query('SET FOREIGN_KEY_CHECKS=0');
    await qr.query(`ALTER TABLE \`commercial_group\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await qr.query(`ALTER TABLE \`commercial_planning\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await qr.query(`ALTER TABLE \`group_schedule_day\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await qr.query(`ALTER TABLE \`commercial_planning_audit\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await qr.query('SET FOREIGN_KEY_CHECKS=1');
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Pas de rollback : revenir à unicode_ci recréerait le bug de collation
  }
}
