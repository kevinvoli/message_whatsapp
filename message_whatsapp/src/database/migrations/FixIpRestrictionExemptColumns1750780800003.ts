import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration corrective : s'assure que ip_restriction_exempt existe sur les deux tables.
 * Utilise IF NOT EXISTS (supporté MariaDB 10.0.2+) pour être idempotente.
 * Corrige le cas où AddIpRestrictionExempt1750608000001 aurait partiellement échoué.
 */
export class FixIpRestrictionExemptColumns1750780800003 implements MigrationInterface {
  name = 'FixIpRestrictionExemptColumns1750780800003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_poste\` ADD COLUMN IF NOT EXISTS \`ip_restriction_exempt\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_commercial\` ADD COLUMN IF NOT EXISTS \`ip_restriction_exempt\` TINYINT(1) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ne pas supprimer — cette migration est corrective, pas fonctionnelle
  }
}
