import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixPlanningOverridePosteCollation1783000000006 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Migration 1783000000005 a changé override_poste_id en general_ci en supposant que
    // whatsapp_poste.id était general_ci. C'est faux : whatsapp_poste a été créé par
    // 20260321_sync_all_entities avec COLLATE=utf8mb4_unicode_ci.
    // override_poste_id (general_ci) vs whatsapp_poste.id (unicode_ci) → errno 1267
    // → Revenir à unicode_ci pour aligner les deux côtés du JOIN
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`override_poste_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`override_poste_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
    `);
  }
}
