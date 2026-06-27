import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPlanningOverridePosteCollationFinal1783000000007 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Diagnostic INFORMATION_SCHEMA confirmé :
    //   whatsapp_poste.id          = utf8mb4_general_ci
    //   override_poste_id          = utf8mb4_unicode_ci  (migration 6 l'a mis à tort en unicode_ci)
    // → remettre override_poste_id en general_ci pour aligner le JOIN
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`override_poste_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`override_poste_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    `);
  }
}
