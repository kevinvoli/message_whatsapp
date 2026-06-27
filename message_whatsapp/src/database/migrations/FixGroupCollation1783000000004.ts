import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixGroupCollation1783000000004 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // commercial_group existait avec utf8mb4_general_ci avant CommercialGroupFoundations1783000000001
    // — le branch IF NOT EXISTS a préservé la collation d'origine → JOINs échouent avec errno 1267
    await qr.query(`
      ALTER TABLE \`commercial_group\`
        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // whatsapp_commercial.sub_group_id héritait de la collation generale de la table parente
    // — les JOINs sur commercial_sub_group.id (unicode_ci) échouent
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        MODIFY COLUMN \`sub_group_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        MODIFY COLUMN \`sub_group_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
    `);
    await qr.query(`
      ALTER TABLE \`commercial_group\`
        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
    `);
  }
}
