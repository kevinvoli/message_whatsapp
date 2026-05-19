import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommercialPlanning1779148800001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const exists = await qr.hasTable('commercial_planning');
    if (!exists) {
      await qr.query(`
        CREATE TABLE \`commercial_planning\` (
          \`id\`                   CHAR(36)                         NOT NULL DEFAULT (UUID()),
          \`commercial_id\`        CHAR(36)                         NOT NULL,
          \`type\`                 ENUM('absence','exceptional')    NOT NULL,
          \`date\`                 DATE                             NOT NULL,
          \`linked_commercial_id\` CHAR(36)                         NULL,
          \`override_poste_id\`    CHAR(36)                         NULL,
          \`reason\`               VARCHAR(255)                     NULL,
          \`declared_by\`          VARCHAR(100)                     NULL,
          \`created_at\`           DATETIME                         NOT NULL DEFAULT NOW(),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_commercial_planning_date\` (\`commercial_id\`, \`date\`),
          INDEX \`IDX_commercial_planning_date\` (\`date\`),
          INDEX \`IDX_commercial_planning_type_date\` (\`type\`, \`date\`),
          CONSTRAINT \`FK_cp_commercial\`
            FOREIGN KEY (\`commercial_id\`) REFERENCES \`whatsapp_commercial\` (\`id\`)
            ON DELETE CASCADE,
          CONSTRAINT \`FK_cp_linked\`
            FOREIGN KEY (\`linked_commercial_id\`) REFERENCES \`whatsapp_commercial\` (\`id\`)
            ON DELETE SET NULL,
          CONSTRAINT \`FK_cp_poste\`
            FOREIGN KEY (\`override_poste_id\`) REFERENCES \`whatsapp_poste\` (\`id\`)
            ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS \`commercial_planning\``);
  }
}
