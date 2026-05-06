import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFollowUpTemplateMapping1778180000002 implements MigrationInterface {
  name = 'AddFollowUpTemplateMapping1778180000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('follow_up_template_mapping');
    if (!hasTable) {
      await queryRunner.query(`
        CREATE TABLE \`follow_up_template_mapping\` (
          \`id\` CHAR(36) NOT NULL,
          \`follow_up_type\` ENUM(
            'rappel',
            'relance_post_conversation',
            'relance_sans_commande',
            'relance_post_annulation',
            'relance_fidelisation',
            'relance_sans_reponse'
          ) NOT NULL,
          \`template_id\` VARCHAR(36) NULL,
          \`template_name\` VARCHAR(512) NULL,
          \`language_code\` VARCHAR(20) NOT NULL DEFAULT 'fr',
          \`active\` TINYINT NOT NULL DEFAULT 1,
          \`created_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_follow_up_template_mapping_type\` (\`follow_up_type\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`follow_up_template_mapping\``);
  }
}
