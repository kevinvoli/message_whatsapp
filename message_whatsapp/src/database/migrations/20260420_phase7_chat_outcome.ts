import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7ChatOutcome1745100000001 implements MigrationInterface {
  name = 'Phase7ChatOutcome1745100000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // whatsapp_chat pre-dates migrations (synchronize/dump) — use raw SQL to avoid TypeORM cache issues
    if (!(await queryRunner.hasColumn('whatsapp_chat', 'conversation_result'))) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_chat\` ADD COLUMN \`conversation_result\` ENUM('commande_confirmee','commande_a_saisir','a_relancer','rappel_programme','pas_interesse','sans_reponse','infos_incompletes','deja_client','annule') NULL DEFAULT NULL`,
      );
    }
    if (!(await queryRunner.hasColumn('whatsapp_chat', 'conversation_result_at'))) {
      await queryRunner.query('ALTER TABLE `whatsapp_chat` ADD COLUMN `conversation_result_at` TIMESTAMP NULL DEFAULT NULL');
    }
    if (!(await queryRunner.hasColumn('whatsapp_chat', 'conversation_result_by'))) {
      await queryRunner.query('ALTER TABLE `whatsapp_chat` ADD COLUMN `conversation_result_by` CHAR(36) NULL DEFAULT NULL');
    }
    if (!(await queryRunner.hasColumn('whatsapp_chat', 'is_locked'))) {
      await queryRunner.query('ALTER TABLE `whatsapp_chat` ADD COLUMN `is_locked` TINYINT(1) NOT NULL DEFAULT 0');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['conversation_result', 'conversation_result_at', 'conversation_result_by', 'is_locked']) {
      if (await queryRunner.hasColumn('whatsapp_chat', col)) {
        await queryRunner.query(`ALTER TABLE \`whatsapp_chat\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
