import { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboundHsmV2_1746000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [row] = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'whatsapp_template'
         AND COLUMN_NAME  = 'rejection_reason'`,
    )) as Array<{ cnt: number }>;

    if (Number(row.cnt) === 0) {
      await queryRunner.query(
        `ALTER TABLE \`whatsapp_template\`
         ADD COLUMN \`rejection_reason\` varchar(500) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_template\`
       DROP COLUMN IF EXISTS \`rejection_reason\``,
    );
  }
}
