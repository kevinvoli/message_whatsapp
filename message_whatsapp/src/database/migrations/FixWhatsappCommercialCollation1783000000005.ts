import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhatsappCommercialCollation1783000000005 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // whatsapp_commercial a été créé avec utf8mb4_general_ci (collation serveur par défaut)
    // Toutes ses colonnes (id, email, name, group_id, sub_group_id...) héritent general_ci
    // → JOINs vers commercial_group (now unicode_ci) et commercial_planning (unicode_ci) échouent
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
    `);
  }
}
