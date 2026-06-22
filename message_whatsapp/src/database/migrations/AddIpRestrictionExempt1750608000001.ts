import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIpRestrictionExempt1750608000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_poste\` ADD COLUMN \`ip_restriction_exempt\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` ADD COLUMN \`ip_restriction_exempt\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` DROP COLUMN \`ip_restriction_exempt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_poste\` DROP COLUMN \`ip_restriction_exempt\``,
    );
  }
}
