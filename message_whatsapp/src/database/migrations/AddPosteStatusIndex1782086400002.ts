import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosteStatusIndex1782086400002 implements MigrationInterface {
  name = 'AddPosteStatusIndex1782086400002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'whatsapp_chat'
        AND INDEX_NAME   = 'IDX_chat_poste_status'
    `);
    if (parseInt(exists[0].cnt, 10) === 0) {
      await queryRunner.query(`
        CREATE INDEX \`IDX_chat_poste_status\`
          ON \`whatsapp_chat\` (\`poste_id\`, \`status\`, \`deletedAt\`)
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_chat_poste_status\` ON \`whatsapp_chat\``);
  }
}
