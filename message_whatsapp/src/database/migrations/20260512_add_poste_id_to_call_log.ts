import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosteIdToCallLog1747094400004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`call_log\`
      ADD COLUMN \`poste_id\` VARCHAR(36) NULL DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX \`IDX_call_log_poste_id\` ON \`call_log\` (\`poste_id\`)
    `);

    await queryRunner.query(`
      UPDATE \`call_log\` cl
      INNER JOIN \`whatsapp_commercial\` c ON c.id = cl.commercial_id
      SET cl.poste_id = c.poste_id
      WHERE cl.poste_id IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_call_log_poste_id\` ON \`call_log\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`call_log\`
      DROP COLUMN \`poste_id\`
    `);
  }
}
