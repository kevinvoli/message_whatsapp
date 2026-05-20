import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCommercialCollation1747699200003 implements MigrationInterface {
  name = 'FixCommercialCollation1747699200003';

  async up(qr: QueryRunner): Promise<void> {
    // La migration FixCollations1747699200002 précédente a accidentellement converti
    // whatsapp_commercial en utf8mb4_unicode_ci via un ALTER TABLE dans une transaction
    // qui s'est rollback-ée. MySQL InnoDB (< 8.0) ne rollback pas les DDL.
    // Cela casse le JOIN whatsapp_poste (general_ci) ↔ whatsapp_commercial (unicode_ci).
    // On ramène whatsapp_commercial à utf8mb4_general_ci pour rétablir la cohérence
    // avec toutes les autres tables existantes de la base.
    await qr.query('SET FOREIGN_KEY_CHECKS=0');
    await qr.query(`ALTER TABLE \`whatsapp_commercial\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await qr.query('SET FOREIGN_KEY_CHECKS=1');
  }

  async down(_qr: QueryRunner): Promise<void> {
    // Pas de rollback pertinent
  }
}
