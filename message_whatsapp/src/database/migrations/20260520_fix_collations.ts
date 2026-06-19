import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCollations1747699200002 implements MigrationInterface {
  name = 'FixCollations1747699200002';

  async up(qr: QueryRunner): Promise<void> {
    // Tables créées après cette migration (timestamps juin 2026) peuvent ne pas encore exister —
    // on les convertit uniquement si présentes ; les create-table migrations postérieures utilisent
    // le charset par défaut de la DB (utf8mb4_general_ci).
    await qr.query('SET FOREIGN_KEY_CHECKS=0');
    const tables = ['commercial_group', 'commercial_planning', 'group_schedule_day', 'commercial_planning_audit'];
    for (const table of tables) {
      if (await qr.hasTable(table)) {
        await qr.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
      }
    }
    await qr.query('SET FOREIGN_KEY_CHECKS=1');
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Pas de rollback : revenir à unicode_ci recréerait le bug de collation
  }
}
