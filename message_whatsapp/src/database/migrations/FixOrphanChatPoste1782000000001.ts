import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixOrphanChatPoste1782000000001 implements MigrationInterface {
  name = 'FixOrphanChatPoste1782000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Détache les conversations dont le poste_id référence un poste supprimé.
    // Idempotent : ne touche que les lignes orphelines réelles.
    await queryRunner.query(`
      UPDATE \`whatsapp_chat\` c
      LEFT JOIN \`whatsapp_poste\` p ON c.poste_id = p.id
      SET c.poste_id = NULL
      WHERE c.poste_id IS NOT NULL
        AND p.id IS NULL
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Irréversible : les postes supprimés n'existent plus.
  }
}
