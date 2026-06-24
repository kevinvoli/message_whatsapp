import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBypassRestrictions1750780800004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_poste\` ADD COLUMN \`bypass_restrictions\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` ADD COLUMN \`bypass_restrictions\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` ADD COLUMN \`bypass_restrictions\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whapi_channels\` DROP COLUMN IF EXISTS \`bypass_restrictions\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` DROP COLUMN IF EXISTS \`bypass_restrictions\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_poste\` DROP COLUMN IF EXISTS \`bypass_restrictions\``,
    );
  }
}
