import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoReadOnlyNoCloseToChannel20260414 implements MigrationInterface {
  name = 'AddNoReadOnlyNoCloseToChannel20260414';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`whapi_channels\`
        ADD COLUMN \`no_read_only\` tinyint(1) NOT NULL DEFAULT 0,
        ADD COLUMN \`no_close\`     tinyint(1) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`whapi_channels\`
        DROP COLUMN \`no_read_only\`,
        DROP COLUMN \`no_close\`
    `);
  }
}
