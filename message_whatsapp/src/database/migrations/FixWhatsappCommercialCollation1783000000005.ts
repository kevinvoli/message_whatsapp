import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhatsappCommercialCollation1783000000005 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // group_id doit rejoindre commercial_group.id (converti unicode_ci par migration 4)
    // Pas de FK DB sur ce champ → MODIFY COLUMN sans contrainte
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        MODIFY COLUMN \`group_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    `);

    // commercial_planning : les colonnes FK pointent vers d'anciennes tables (general_ci)
    // whatsapp_commercial.id → general_ci, whatsapp_poste.id → general_ci
    // → aligner les colonnes de jonction pour éviter errno 1267
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`commercial_id\`        VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
        MODIFY COLUMN \`linked_commercial_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
        MODIFY COLUMN \`override_poste_id\`    VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
    `);

    // commercial_planning_audit.commercial_id idem
    await qr.query(`
      ALTER TABLE \`commercial_planning_audit\`
        MODIFY COLUMN \`commercial_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE \`commercial_planning_audit\`
        MODIFY COLUMN \`commercial_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    `);
    await qr.query(`
      ALTER TABLE \`commercial_planning\`
        MODIFY COLUMN \`commercial_id\`        VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        MODIFY COLUMN \`linked_commercial_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
        MODIFY COLUMN \`override_poste_id\`    VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    `);
    await qr.query(`
      ALTER TABLE \`whatsapp_commercial\`
        MODIFY COLUMN \`group_id\` VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL
    `);
  }
}
